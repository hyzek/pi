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
		expect(PLAN_MODE_SYSTEM_PROMPT).toContain("/mode manual");
		expect(isPlanModeToolAllowed("read")).toBe(true);
		expect(isPlanModeToolAllowed("ask_user")).toBe(true);
		expect(isPlanModeToolAllowed("bash")).toBe(false);
	});
});
