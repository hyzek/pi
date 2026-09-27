import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSupervisor, AgentSupervisorError, type CreateChildSessionContext } from "../src/core/agent-supervisor.ts";
import { createAgentSupervisorToolDefinitions } from "../src/core/tools/agent-supervisor.ts";
import { createHarness, type FauxResponseInput, type Harness } from "./test-harness.ts";

describe("AgentSupervisor", () => {
	const harnesses: Harness[] = [];
	const supervisors: AgentSupervisor[] = [];

	afterEach(async () => {
		await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.dispose()));
		for (const harness of harnesses.splice(0)) harness.cleanup();
	});

	async function createParent(responses: FauxResponseInput[] = ["parent"]): Promise<Harness> {
		const harness = await createHarness({ responses });
		harnesses.push(harness);
		return harness;
	}

	function createChildFactory(options?: { delayMs?: number; text?: string; error?: string }) {
		let active = 0;
		let maximum = 0;
		const contexts: CreateChildSessionContext[] = [];
		const factory = async (context: CreateChildSessionContext) => {
			contexts.push(context);
			active++;
			maximum = Math.max(maximum, active);
			const child = await createHarness({
				responses: [
					{ delayMs: options?.delayMs, text: options?.text ?? context.request.task, error: options?.error },
				],
				model: context.model,
			});
			harnesses.push(child);
			child.session.subscribe((event) => {
				if (event.type === "agent_settled") active--;
			});
			return child.session;
		};
		return { factory, contexts, getMaximum: () => maximum };
	}

	it("returns an ID immediately and delivers bounded completion results", async () => {
		const parent = await createParent();
		const childFactory = createChildFactory({ text: "child result" });
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: childFactory.factory,
			maxResultChars: 6,
		});
		supervisors.push(supervisor);

		const id = supervisor.spawnAgent({ task: "inspect the project", name: "Scout" });
		expect(id).toMatch(/^agent-/);
		expect(supervisor.getAgentStatus(id)[0].status).toBe("running");

		const [status] = await supervisor.waitAgents({ ids: [id] });
		expect(status.status).toBe("completed");
		expect(status.result).toMatchObject({ text: "child ", truncated: true });
		expect(status.parentId).toBe(parent.session.sessionId);
		expect(status.transcriptReference).toBeUndefined();
	});

	it("caps concurrent children at two and queues additional work", async () => {
		const parent = await createParent();
		const childFactory = createChildFactory({ delayMs: 20 });
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: childFactory.factory,
		});
		supervisors.push(supervisor);

		const ids = ["one", "two", "three"].map((task) => supervisor.spawnAgent({ task, name: task }));
		expect(supervisor.getAgentStatus(ids[2])[0].status).toBe("queued");
		const statuses = await supervisor.waitAgents({ ids });

		expect(statuses.every((status) => status.status === "completed")).toBe(true);
		expect(childFactory.getMaximum()).toBeLessThanOrEqual(2);
	});

	it("requires short model-supplied names and limits a session to five children", async () => {
		const parent = await createParent();
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: createChildFactory({ delayMs: 100 }).factory,
		});
		supervisors.push(supervisor);

		expect(() => supervisor.spawnAgent({ task: "inspect", name: "TooLong" })).toThrow(AgentSupervisorError);
		expect(() => supervisor.spawnAgent({ task: "inspect", name: "A1" })).toThrow(AgentSupervisorError);
		const names = ["One", "Two", "Tri", "Four", "Five"];
		for (const name of names.slice(0, 4)) supervisor.spawnAgent({ task: `inspect ${name}`, name });
		expect(() => supervisor.spawnAgent({ task: "again", name: "ONE" })).toThrow(/already in use/);
		supervisor.spawnAgent({ task: "inspect Five", name: "Five" });
		expect(supervisor.getAgentStatus().map((status) => status.title)).toEqual(names);
		expect(() => supervisor.spawnAgent({ task: "one more", name: "Six" })).toThrow(/at most 5 child agents/);
	});

	it("does not restart the parent after wait_agents has returned a child result", async () => {
		const parent = await createParent([{ text: "summary", delayMs: 100 }, "duplicate"]);
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: createChildFactory({ delayMs: 10, text: "finding" }).factory,
			resumeParentOnChildCompletion: true,
		});
		supervisors.push(supervisor);

		const parentTurn = parent.session.prompt("delegate and summarize");
		await vi.waitFor(() => expect(parent.session.isStreaming).toBe(true));
		const id = supervisor.spawnAgent({ task: "inspect", name: "Scout" });
		const [status] = await supervisor.waitAgents({ ids: [id] });
		expect(status.result?.text).toBe("finding");
		await parentTurn;
		await new Promise((resolve) => setTimeout(resolve, 80));
		expect(parent.faux.callCount).toBe(1);
		expect(
			parent.session.messages.some((message) => message.role === "custom" && message.customType === "agent_updates"),
		).toBe(false);
	});

	it("resumes an idle parent with a hidden internal child update", async () => {
		const parent = await createParent(["summary"]);
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: createChildFactory({ text: "finding" }).factory,
			resumeParentOnChildCompletion: true,
		});
		supervisors.push(supervisor);
		supervisor.spawnAgent({ task: "inspect", name: "Scout" });

		await vi.waitFor(() => expect(parent.eventsOfType("agent_settled")).toHaveLength(1));
		const messages = parent.eventsOfType("message_start").map((event) => event.message);
		expect(messages.some((message) => message.role === "user")).toBe(false);
		const update = messages.find((message) => message.role === "custom" && message.customType === "agent_updates");
		expect(update).toMatchObject({ role: "custom", display: false, content: expect.stringContaining("finding") });
		expect(parent.faux.callCount).toBe(1);
	});

	it("inherits model and thinking level and exposes only lifecycle tools", async () => {
		const parent = await createParent();
		const childFactory = createChildFactory();
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: childFactory.factory,
		});
		supervisors.push(supervisor);

		const id = supervisor.spawnAgent({ task: "inspect", name: "Probe", thinkingLevel: "high" });
		await supervisor.waitAgents({ ids: [id] });
		expect(childFactory.contexts[0]?.model).toMatchObject({
			provider: parent.session.model?.provider,
			id: parent.session.model?.id,
		});
		expect(childFactory.contexts[0]?.thinkingLevel).toBe("high");
		expect(childFactory.contexts[0]?.childTools).not.toContain("ask_user");
		expect(childFactory.contexts[0]?.childTools).toEqual(["read"]);
		expect(parent.session.getActiveToolNames()).toEqual(
			expect.arrayContaining(["spawn_agent", "wait_agents", "send_agent_message", "stop_agent"]),
		);
		expect(new Set(parent.session.getActiveToolNames()).size).toBe(parent.session.getActiveToolNames().length);
	});

	it("rejects unknown model overrides and records failures", async () => {
		const parent = await createParent();
		const childFactory = createChildFactory({ error: "child failed" });
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: childFactory.factory,
		});
		supervisors.push(supervisor);

		expect(() =>
			supervisor.spawnAgent({ task: "bad model", name: "Bad", model: { provider: "missing", modelId: "none" } }),
		).toThrow(AgentSupervisorError);
		const id = supervisor.spawnAgent({ task: "fail", name: "Fail" });
		const [status] = await supervisor.waitAgents({ ids: [id] });
		expect(status.status).toBe("failed");
		expect(status.error).toContain("child failed");
	});

	it("stops queued and running children and propagates parent cancellation", async () => {
		const parent = await createParent();
		const childFactory = createChildFactory({ delayMs: 100 });
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: childFactory.factory,
		});
		supervisors.push(supervisor);

		const id = supervisor.spawnAgent({ task: "cancel me", name: "Stop" });
		await supervisor.stopAgent(id);
		expect(supervisor.getAgentStatus(id)[0].status).toBe("cancelled");

		const parentAbort = new AbortController();
		const secondParent = await createParent();
		const second = new AgentSupervisor({
			parentSession: secondParent.session,
			createChildSession: childFactory.factory,
			parentSignal: parentAbort.signal,
		});
		supervisors.push(second);
		const secondId = second.spawnAgent({ task: "interrupt me", name: "Break" });
		parentAbort.abort();
		const [status] = await second.waitAgents({ ids: [secondId] });
		expect(status.status).toBe("interrupted");
	});

	it("reloads completed and marks unfinished records interrupted", async () => {
		const parent = await createParent();
		const childFactory = createChildFactory({ text: "persisted" });
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: childFactory.factory,
		});
		supervisors.push(supervisor);
		const id = supervisor.spawnAgent({ task: "persist this", name: "Store" });
		await supervisor.waitAgents({ ids: [id] });

		const reloadedParent = await createParent();
		for (const entry of parent.session.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "agent_child") {
				const data = { ...(entry.data as Record<string, unknown>), parentId: reloadedParent.session.sessionId };
				reloadedParent.session.sessionManager.appendCustomEntry(entry.customType, data);
			}
		}
		reloadedParent.session.sessionManager.appendCustomEntry("agent_child", {
			id: "unfinished-child",
			parentId: reloadedParent.session.sessionId,
			task: "unfinished",
			title: "unfinished",
			workspace: reloadedParent.session.sessionManager.getCwd(),
			model: { provider: "faux", modelId: "faux-1" },
			thinkingLevel: "medium",
			status: "running",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
		});
		const reloaded = new AgentSupervisor({
			parentSession: reloadedParent.session,
			createChildSession: childFactory.factory,
		});
		supervisors.push(reloaded);
		expect(reloaded.getAgentStatus(id)[0].status).toBe("completed");
		expect(reloaded.getAgentStatus(id)[0].result?.text).toBe("persisted");
		expect(reloaded.getAgentStatus("unfinished-child")[0].status).toBe("interrupted");
	});

	it("provides built-in lifecycle tool definitions", async () => {
		const parent = await createParent();
		const supervisor = new AgentSupervisor({
			parentSession: parent.session,
			createChildSession: createChildFactory().factory,
		});
		supervisors.push(supervisor);
		expect(createAgentSupervisorToolDefinitions(supervisor).map((tool) => tool.name)).toEqual([
			"spawn_agent",
			"wait_agents",
			"send_agent_message",
			"stop_agent",
		]);
	});
});
