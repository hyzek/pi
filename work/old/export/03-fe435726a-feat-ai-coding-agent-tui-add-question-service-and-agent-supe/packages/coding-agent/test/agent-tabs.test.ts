import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it } from "vitest";
import type { AgentChildSnapshot } from "../src/core/agent-supervisor.ts";
import { AgentTabsComponent } from "../src/modes/interactive/components/agent-tabs.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function agent(id: string, title: string): AgentChildSnapshot {
	return {
		id,
		parentId: "parent",
		task: title,
		title,
		workspace: "/tmp/project",
		model: { provider: "test", modelId: "test-model" },
		thinkingLevel: "medium",
		status: "running",
		createdAt: "2026-09-16T10:00:00.000Z",
		updatedAt: "2026-09-16T10:00:00.000Z",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
		queuedMessages: 0,
	};
}

describe("AgentTabsComponent", () => {
	beforeAll(() => initTheme(undefined, false));

	it("adds one input-colored row only when child agents exist", () => {
		let agents: AgentChildSnapshot[] = [];
		const tabs = new AgentTabsComponent({
			getMainTitle: () => "My session",
			getAgents: () => agents,
			getSelectedId: () => undefined,
		});
		expect(tabs.render(80)).toEqual([]);
		agents = [agent("one", "Task one"), agent("two", "Task two")];
		const lines = tabs.render(80);
		expect(lines).toHaveLength(1);
		expect(stripAnsi(lines[0])).toContain("Main (My session)  Task one  Task two");
		expect(visibleWidth(lines[0])).toBe(80);
		expect(lines[0]).toContain("\x1b[4m");
	});

	it("keeps the selected child visible at narrow widths", () => {
		const tabs = new AgentTabsComponent({
			getMainTitle: () => "Main",
			getAgents: () => [agent("one", "First task"), agent("two", "Second task"), agent("three", "Third task")],
			getSelectedId: () => "three",
		});
		const line = tabs.render(28)[0];
		expect(stripAnsi(line)).toContain("Third");
		expect(visibleWidth(line)).toBe(28);
	});

	it("sanitizes session and task titles before styling them", () => {
		const tabs = new AgentTabsComponent({
			getMainTitle: () => "\x1b]0;hidden\x07My\n session",
			getAgents: () => [agent("one", "\x1b[31mLimerick\x1b[0m\t about\x07 a bug")],
			getSelectedId: () => "one",
		});
		const line = tabs.render(80)[0];
		expect(stripAnsi(line)).toContain("Main (My session)  Limerick about a bug");
		expect(line).not.toContain("\x07");
		expect(line).not.toContain("hidden");
		expect(line).not.toContain("\x1b[31m");
		expect(visibleWidth(line)).toBe(80);
	});

	it("clips an isolated tab before styling, without resetting the background at the ellipsis", () => {
		const tabs = new AgentTabsComponent({
			getMainTitle: () => undefined,
			getAgents: () => [agent("one", "Limerick about a bug")],
			getSelectedId: () => "one",
		});
		const line = tabs.render(8)[0];
		expect(stripAnsi(line)).toBe("  Limer…");
		expect(line).not.toContain("\x1b[0m…");
		expect(visibleWidth(line)).toBe(8);
	});

	it("hides the row outside the active chat editor", () => {
		let visible = true;
		const tabs = new AgentTabsComponent({
			getMainTitle: () => undefined,
			getAgents: () => [agent("one", "Scout")],
			getSelectedId: () => undefined,
			isVisible: () => visible,
		});
		expect(tabs.render(40)).toHaveLength(1);
		visible = false;
		expect(tabs.render(40)).toEqual([]);
		visible = true;
		expect(tabs.render(40)).toHaveLength(1);
	});
});
