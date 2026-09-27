import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import type { AgentSession } from "../src/core/agent-session.ts";
import type { AgentChildSnapshot } from "../src/core/agent-supervisor.ts";
import type { ReadonlyFooterDataProvider } from "../src/core/footer-data-provider.ts";
import { FooterComponent, formatCwdForFooter } from "../src/modes/interactive/components/footer.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

type AssistantUsage = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: { total: number };
};

function createSession(options: {
	sessionName: string;
	modelId?: string;
	provider?: string;
	permissionMode?: "auto" | "manual" | "plan";
	reasoning?: boolean;
	thinkingLevel?: string;
	usage?: AssistantUsage;
	branchUsage?: AssistantUsage;
	compactionUsage?: AssistantUsage;
	toolUsage?: AssistantUsage;
	usingSubscription?: boolean;
	agents?: AgentChildSnapshot[];
}): AgentSession {
	const usage = options.usage;
	const entries: Array<Record<string, unknown>> = [];

	if (usage !== undefined) {
		entries.push({
			type: "message",
			message: {
				role: "assistant",
				usage,
			},
		});
	}

	if (options.branchUsage !== undefined) {
		entries.push({
			type: "branch_summary",
			usage: options.branchUsage,
		});
	}

	if (options.compactionUsage !== undefined) {
		entries.push({
			type: "compaction",
			usage: options.compactionUsage,
		});
	}

	if (options.toolUsage !== undefined) {
		entries.push({
			type: "message",
			message: {
				role: "toolResult",
				usage: options.toolUsage,
			},
		});
	}

	const session = {
		permissionMode: options.permissionMode ?? "manual",
		state: {
			model: {
				id: options.modelId ?? "test-model",
				provider: options.provider ?? "test",
				contextWindow: 200_000,
				reasoning: options.reasoning ?? false,
			},
			thinkingLevel: options.thinkingLevel ?? "off",
		},
		sessionManager: {
			getEntries: () => entries,
			getSessionName: () => options.sessionName,
			getCwd: () => "/tmp/project",
		},
		getContextUsage: () => ({ tokens: 24_600, contextWindow: 200_000, percent: 12.3 }),
		modelRuntime: {
			isUsingSubscription: () => options.usingSubscription ?? false,
		},
		agentSupervisor: options.agents
			? {
					getAgentStatus: () => options.agents ?? [],
					subscribe: () => () => {},
				}
			: undefined,
	};

	return session as unknown as AgentSession;
}

function createFooterData(providerCount: number): ReadonlyFooterDataProvider {
	const provider = {
		getGitBranch: () => "main",
		getExtensionStatuses: () => new Map<string, string>(),
		getAvailableProviderCount: () => providerCount,
		onBranchChange: (callback: () => void) => {
			void callback;
			return () => {};
		},
	};

	return provider;
}

describe("formatCwdForFooter", () => {
	beforeAll(() => {
		initTheme(undefined, false);
	});

	it("does not abbreviate sibling paths that share the home prefix", () => {
		expect(formatCwdForFooter("/home/user2", "/home/user")).toBe("/home/user2");
	});

	it("abbreviates the home directory and descendants", () => {
		expect(formatCwdForFooter("/home/user", "/home/user")).toBe("~");
		expect(formatCwdForFooter("/home/user/project", "/home/user")).toBe("~/project");
	});
});

describe("FooterComponent width handling", () => {
	it("keeps all lines within width for wide session names", () => {
		const width = 93;
		const session = createSession({ sessionName: "한글".repeat(30) });
		const footer = new FooterComponent(session, createFooterData(1));

		const lines = footer.render(width);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("keeps stats line within width for wide model and provider names", () => {
		const width = 60;
		const session = createSession({
			sessionName: "",
			modelId: "模".repeat(30),
			provider: "공급자",
			reasoning: true,
			thinkingLevel: "high",
			usage: {
				input: 12_345,
				output: 6_789,
				cacheRead: 0,
				cacheWrite: 0,
				cost: { total: 1.234 },
			},
		});
		const footer = new FooterComponent(session, createFooterData(2));

		const lines = footer.render(width);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("shows mode, model, and reasoning effort without context details", () => {
		const session = createSession({
			sessionName: "",
			permissionMode: "plan",
			modelId: "claude-sonnet",
			reasoning: true,
			thinkingLevel: "high",
		});
		const footer = new FooterComponent(session, createFooterData(2));
		const line = stripAnsi(footer.render(120)[0]);

		expect(line).toContain("◇ plan mode");
		expect(line).toContain("claude-sonnet");
		expect(line).toContain("high");
		expect(line).not.toContain("12.3%");
		expect(line).not.toContain("200k");
	});

	it("omits the effort label for models without reasoning", () => {
		const session = createSession({ sessionName: "", permissionMode: "auto", modelId: "gpt-4o" });
		const footer = new FooterComponent(session, createFooterData(1));
		const line = stripAnsi(footer.render(120)[0]);

		expect(line).toContain("▸ auto mode");
		expect(line).toContain("gpt-4o");
		expect(line).not.toContain("off");
	});

	it("shows selected child token usage in the footer", () => {
		const createdAt = new Date(Date.now() - 5_000).toISOString();
		const session = createSession({
			sessionName: "",
			agents: [
				{
					id: "agent-1",
					parentId: "parent-1",
					task: "Review the API surface",
					title: "\x1b[31mReview API surface\x1b[0m\x07",
					workspace: "/tmp/project",
					model: { provider: "test", modelId: "test-model" },
					thinkingLevel: "medium",
					status: "running",
					createdAt,
					updatedAt: createdAt,
					activity: "Reading files",
					usage: { input: 500, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0 },
					queuedMessages: 0,
				},
			],
		});
		const footer = new FooterComponent(session, createFooterData(1));
		footer.setSelectedChild("agent-1");

		const rawLines = footer.render(120);
		const lines = rawLines.map(stripAnsi);
		footer.dispose();
		expect(lines).toHaveLength(1);
		expect(rawLines[0]).not.toContain("\x1b[31m");
		expect(rawLines[0]).not.toContain("\x07");
		expect(lines[0]).toContain("Review API surface");
		expect(lines[0]).toContain("600 tokens");
		expect(lines[0]).toContain("test-model");
		expect(lines[0]).not.toContain("Reading files");
	});

	it("marks in-flight token estimates and restores main context on tab switch", () => {
		const session = createSession({
			sessionName: "",
			agents: [
				{
					id: "agent-1",
					parentId: "parent-1",
					task: "Review the API surface",
					title: "Review API surface",
					workspace: "/tmp/project",
					model: { provider: "test", modelId: "test-model" },
					thinkingLevel: "medium",
					status: "running",
					createdAt: new Date(Date.now() - 5_000).toISOString(),
					updatedAt: new Date().toISOString(),
					usage: { input: 500, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0 },
					usageEstimated: true,
					queuedMessages: 0,
				},
			],
		});
		const footer = new FooterComponent(session, createFooterData(1));
		footer.setSelectedChild("agent-1");
		expect(stripAnsi(footer.render(120)[0])).toContain("~600 tokens");
		footer.setSelectedChild(undefined);
		expect(stripAnsi(footer.render(120)[0])).toContain("test-model");
		footer.dispose();
	});
});
