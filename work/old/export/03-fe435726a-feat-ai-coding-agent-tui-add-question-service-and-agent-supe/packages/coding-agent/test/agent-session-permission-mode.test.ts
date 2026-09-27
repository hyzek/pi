import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";

let tempDir: string;

beforeEach(() => {
	tempDir = join(tmpdir(), `flux-permission-mode-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
	if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

async function createSession(
	options: { permissionMode?: "auto" | "manual" | "plan"; tools?: string[]; excludeTools?: string[] } = {},
) {
	const agentDir = join(tempDir, "agent");
	mkdirSync(agentDir, { recursive: true });
	const settingsManager = SettingsManager.create(tempDir, agentDir);
	const resourceLoader = new DefaultResourceLoader({ cwd: tempDir, agentDir, settingsManager });
	await resourceLoader.reload();
	return createAgentSession({
		cwd: tempDir,
		agentDir,
		model: getModel("anthropic", "claude-sonnet-4-5")!,
		settingsManager,
		sessionManager: SessionManager.inMemory(),
		resourceLoader,
		permissionMode: options.permissionMode,
		tools: options.tools,
		excludeTools: options.excludeTools,
	});
}

describe("AgentSession plan-mode delivery gate", () => {
	it("exposes only safe tools, keeps ask_user available, and rejects direct mutation calls", async () => {
		const { session } = await createSession({ permissionMode: "plan" });

		expect(session.getActiveToolNames()).toEqual(["read", "grep", "find", "ls", "ask_user"]);
		expect(session.getToolDefinition("ask_user")).toBeDefined();
		const beforeToolCall = session.agent.beforeToolCall;
		expect(beforeToolCall).toBeDefined();
		const blocked = await beforeToolCall!({
			assistantMessage: {} as never,
			toolCall: { id: "call-1", name: "edit", arguments: "{}" } as never,
			args: { path: "src/index.ts", edits: [] },
			context: {} as never,
		} as never);
		expect(blocked?.block).toBe(true);
		expect(() => session.assertToolCallPermitted("edit")).toThrow("unavailable in plan mode");
		expect(() => session.assertToolCallPermitted("bash", { command: "printf ok" })).toThrow(
			"unavailable in plan mode",
		);
		session.dispose();
	});

	it("restores the configured active tools while preserving allowlists and denylists", async () => {
		const { session } = await createSession({
			tools: ["read", "grep", "find", "ls", "ask_user", "bash", "edit", "write"],
			excludeTools: ["grep", "write"],
		});
		const configuredTools = session.getActiveToolNames();

		session.setPermissionMode("plan");
		expect(session.getActiveToolNames()).toEqual(["read", "find", "ls", "ask_user"]);
		session.setPermissionMode("manual");
		expect(session.getActiveToolNames()).toEqual(configuredTools);
		expect(session.getActiveToolNames()).not.toContain("grep");
		expect(session.getActiveToolNames()).not.toContain("write");
		session.dispose();
	});
});
