import { describe, expect, it } from "vitest";
import {
	classifyToolCall,
	formatToolCallForApproval,
	isPlanModeToolAllowed,
	PLAN_MODE_SYSTEM_PROMPT,
} from "../src/core/permission-mode.ts";

describe("permission mode tool policy", () => {
	it("allows read-only tools without manual approval", () => {
		expect(classifyToolCall("read", { path: "src/index.ts" }).risk).toBe("safe");
		expect(classifyToolCall("grep", { pattern: "TODO" }).risk).toBe("safe");
		expect(classifyToolCall("ask_user", { questions: [] }).risk).toBe("safe");
	});

	it("allows read-only diff and rg shell commands", () => {
		expect(classifyToolCall("bash", { command: "git diff -- src/index.ts" }).risk).toBe("safe");
		expect(classifyToolCall("bash", { command: "rg 'TODO' src" }).risk).toBe("safe");
	});

	it("requires approval for read-only commands that execute through their own options", () => {
		// `env` runs whatever command follows it.
		expect(classifyToolCall("bash", { command: "env rm -rf dist" }).risk).toBe("dangerous");
		// `find` predicates run a command or remove a match outright.
		expect(classifyToolCall("bash", { command: "find . -exec rm -rf {} +" }).risk).toBe("dangerous");
		expect(classifyToolCall("bash", { command: "find . -delete" }).risk).toBe("dangerous");
		// Any `git branch` flag outside the listing set can create or delete.
		expect(classifyToolCall("bash", { command: "git branch -D main" }).risk).toBe("dangerous");
		// `sed` and `awk` load scripts that can execute or write.
		expect(classifyToolCall("bash", { command: "sed -n '1e rm -rf dist' notes.txt" }).risk).toBe("dangerous");
		expect(classifyToolCall("bash", { command: "awk -f build.awk input.txt" }).risk).toBe("dangerous");
		// Base command is read-only but the option is not.
		expect(classifyToolCall("bash", { command: "rg --pre rm pattern" }).risk).toBe("dangerous");
		expect(classifyToolCall("bash", { command: "sort -o /etc/hosts notes.txt" }).risk).toBe("dangerous");
		expect(classifyToolCall("bash", { command: "git diff --output=out.patch" }).risk).toBe("dangerous");
	});

	it("keeps the read-only forms of the guarded commands approved", () => {
		expect(classifyToolCall("bash", { command: "git branch --show-current" }).risk).toBe("safe");
		expect(classifyToolCall("bash", { command: "git log --oneline -5" }).risk).toBe("safe");
		expect(classifyToolCall("bash", { command: "find . -name '*.ts'" }).risk).toBe("safe");
		expect(classifyToolCall("bash", { command: "cat package.json" }).risk).toBe("safe");
	});

	it("requires approval for mutations and shell commands with side effects", () => {
		expect(classifyToolCall("edit", { path: "src/index.ts", edits: [] }).risk).toBe("mutating");
		expect(classifyToolCall("write", { path: "src/index.ts", content: "" }).risk).toBe("dangerous");
		expect(classifyToolCall("bash", { command: "rm -rf dist" }).risk).toBe("dangerous");
		expect(classifyToolCall("custom_tool", {}).risk).toBe("dangerous");
	});

	it("formats commands and file mutations for approval dialogs", () => {
		expect(formatToolCallForApproval("bash", { command: "git push origin main" })).toBe("git push origin main");
		expect(formatToolCallForApproval("edit", { path: "src/index.ts", edits: [] })).toBe("edit src/index.ts");
	});
});

describe("plan mode prompt", () => {
	it("allows inspection and questions without allowing mutation", () => {
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("PLAN MODE");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("read, grep, find, and ls");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("ask_user");
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("/work-mode manual");
		expect(isPlanModeToolAllowed("read")).toBe(true);
		expect(isPlanModeToolAllowed("ask_user")).toBe(true);
		expect(isPlanModeToolAllowed("bash")).toBe(false);
	});
});
