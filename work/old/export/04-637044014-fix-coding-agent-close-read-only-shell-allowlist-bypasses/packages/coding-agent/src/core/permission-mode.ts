import { basename } from "node:path";

export type PermissionMode = "auto" | "manual" | "plan";

export type ToolRisk = "safe" | "mutating" | "dangerous";

export interface ToolCallApprovalRequest {
	toolName: string;
	args: unknown;
	risk: Exclude<ToolRisk, "safe">;
	reason: string;
}

export type ToolCallApprovalHandler = (request: ToolCallApprovalRequest, signal?: AbortSignal) => Promise<boolean>;

/**
 * Prompt added to the model request while the session is in plan mode.
 * Tool availability is enforced separately by AgentSession; this text explains
 * the interaction contract and gives the model a useful planning structure.
 */
export const PLAN_MODE_SYSTEM_PROMPT = `You are currently in PLAN MODE.

You may use the read, grep, find, and ls tools to inspect the repository, and ask_user to resolve consequential ambiguity. Do not execute shell commands, edit or write files, use custom tools, or claim that changes were made.

The user's request may be incomplete. First determine what they are trying to achieve. Consider multiple approaches, state your assumptions, identify risks, and give the user clear options. Ask concise clarification questions when needed.

Produce an actionable plan with:
1. The intended outcome
2. Relevant assumptions
3. Possible approaches
4. A recommended approach
5. Concrete implementation steps
6. Any questions or decisions needed from the user

When the plan is ready to execute, tell the user to switch modes with /mode manual. Do not switch modes yourself.`;

export const PLAN_MODE_TOOL_NAMES = ["read", "grep", "find", "ls", "ask_user"] as const;
const PLAN_MODE_TOOL_NAME_SET = new Set<string>(PLAN_MODE_TOOL_NAMES);

export function isPlanModeToolAllowed(toolName: string): boolean {
	return PLAN_MODE_TOOL_NAME_SET.has(toolName);
}

const SAFE_TOOL_NAMES = new Set<string>(PLAN_MODE_TOOL_NAMES);

/**
 * Commands that stay read-only no matter which arguments they are handed.
 * Commands that can execute a program or write a file through an option or a
 * script are deliberately absent — `env` runs its arguments, `sed` and `awk`
 * execute or write from a script, `tree` and `uniq` take an output file — so
 * they fall through to manual approval instead.
 */
const READ_ONLY_COMMANDS = new Set<string>([
	"bat",
	"cat",
	"date",
	"df",
	"du",
	"eza",
	"file",
	"grep",
	"head",
	"id",
	"ls",
	"printenv",
	"ps",
	"pwd",
	"rg",
	"stat",
	"tail",
	"type",
	"uname",
	"uptime",
	"wc",
	"whereis",
	"which",
	"whoami",
]);

/** Read-only `git` subcommands. Anything else may write, so it needs approval. */
const READ_ONLY_GIT_SUBCOMMANDS = new Set<string>(["branch", "diff", "log", "ls-files", "show", "status"]);

/** `git branch` flags that only list or read; any other flag can create or delete a branch. */
const READ_ONLY_GIT_BRANCH_FLAGS = new Set<string>([
	"-a",
	"-l",
	"-r",
	"-v",
	"-vv",
	"--all",
	"--list",
	"--remotes",
	"--show-current",
	"--verbose",
]);

/** `find` predicates that run a command or remove a file. */
const FIND_EXECUTION_PREDICATE = /^-(?:exec|execdir|ok|okdir|delete|fls|fprint|fprint0|fprintf)$/;

/** Options that make an otherwise read-only command write to a file. */
const OUTPUT_FILE_OPTION = new Set<string>(["-o", "--output"]);

function hasOutputFileOption(args: readonly string[]): boolean {
	return args.some((arg) => OUTPUT_FILE_OPTION.has(arg) || arg.startsWith("--output="));
}

function isReadOnlyGitCommand(tokens: readonly string[]): boolean {
	const subcommand = tokens[1]?.toLowerCase();
	if (!subcommand || !READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return false;
	const args = tokens.slice(2).map((token) => token.toLowerCase());
	if (hasOutputFileOption(args)) return false;
	if (subcommand === "branch") return args.every((arg) => READ_ONLY_GIT_BRANCH_FLAGS.has(arg));
	return true;
}

/**
 * Approve only commands that cannot mutate state. Commands containing shell
 * metacharacters are rejected first, so the string inspected here is the string
 * that runs. The remaining checks are allowlists rather than denylists:
 * anything unrecognised — an unknown command, subcommand, or option — needs
 * manual approval.
 */
function isReadOnlyShellCommand(command: string): boolean {
	const trimmed = command.trim();
	if (!trimmed || /[;&|><`\n\r]|\$\(|\$\{|\(.*\)/.test(trimmed)) return false;

	const tokens = trimmed.split(/\s+/);
	const base = tokens[0]?.toLowerCase();
	if (!base) return false;
	const args = tokens.slice(1).map((token) => token.toLowerCase());

	if (base === "git") return isReadOnlyGitCommand(tokens);
	if (base === "find") return !args.some((arg) => FIND_EXECUTION_PREDICATE.test(arg));
	// `rg --pre` runs an arbitrary command against every file it searches.
	if (base === "rg") return !args.some((arg) => arg === "--pre" || arg.startsWith("--pre="));
	if (base === "sort") return !hasOutputFileOption(args);

	return READ_ONLY_COMMANDS.has(base);
}

function getStringArg(args: unknown, key: string): string | undefined {
	if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
	const value = (args as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
}

/** Classify a validated tool call for the manual permission policy. */
export function classifyToolCall(
	toolName: string,
	args: unknown,
): {
	risk: ToolRisk;
	reason: string;
} {
	if (SAFE_TOOL_NAMES.has(toolName)) {
		return { risk: "safe", reason: "read-only inspection" };
	}

	if (toolName === "bash" || toolName === "powershell") {
		const command = getStringArg(args, "command");
		if (command && isReadOnlyShellCommand(command)) {
			return { risk: "safe", reason: "read-only shell command" };
		}
		return { risk: "dangerous", reason: "arbitrary shell command" };
	}

	if (toolName === "edit") {
		return { risk: "mutating", reason: "modify an existing file" };
	}

	if (toolName === "write") {
		const filePath = getStringArg(args, "path");
		return {
			risk: "dangerous",
			reason: filePath ? `create or overwrite ${basename(filePath)}` : "create or overwrite a file",
		};
	}

	return { risk: "dangerous", reason: "custom tool with unknown side effects" };
}

function formatValue(value: unknown): string {
	try {
		const serialized = JSON.stringify(value, null, 2);
		if (serialized !== undefined) return serialized;
	} catch {
		// Fall through to String for unusual extension arguments.
	}
	return String(value);
}

/** Compact, user-facing details for an approval dialog. */
export function formatToolCallForApproval(toolName: string, args: unknown): string {
	const command = getStringArg(args, "command");
	if (command) return command;

	const filePath = getStringArg(args, "path");
	if (filePath && (toolName === "edit" || toolName === "write")) {
		return `${toolName} ${filePath}`;
	}

	const value = formatValue(args);
	return value.length > 1600 ? `${value.slice(0, 1597)}...` : value;
}
