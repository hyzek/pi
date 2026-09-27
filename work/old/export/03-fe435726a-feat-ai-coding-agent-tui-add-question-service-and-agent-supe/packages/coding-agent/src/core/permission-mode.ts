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

const READ_ONLY_COMMAND =
	/^(?:rg|grep|git\s+(?:diff|status|log|show|branch(?:\s+--show-current)?|ls-files)|find|ls|pwd|cat|head|tail|sed\s+-n|awk|sort|uniq|wc|file|stat|du|df|tree|which|whereis|type|env|printenv|uname|whoami|id|date|uptime|ps|bat|eza)(?:\s|$)/i;

function isReadOnlyShellCommand(command: string): boolean {
	const trimmed = command.trim();
	if (!trimmed || /[;&|><`\n\r]|\$\(|\$\{|\(.*\)/.test(trimmed)) return false;
	return READ_ONLY_COMMAND.test(trimmed);
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
