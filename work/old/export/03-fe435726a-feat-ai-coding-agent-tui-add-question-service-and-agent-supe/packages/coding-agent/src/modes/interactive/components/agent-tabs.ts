import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AgentChildSnapshot } from "../../../core/agent-supervisor.ts";
import { sanitizeTerminalLabel, stripAnsi } from "../../../utils/ansi.ts";
import { theme } from "../theme/theme.ts";

function truncateTabTitle(title: string, width: number): string {
	return stripAnsi(truncateToWidth(title, width, "…"));
}

export interface AgentTabsOptions {
	getMainTitle: () => string | undefined;
	getAgents: () => AgentChildSnapshot[];
	getSelectedId: () => string | undefined;
	isVisible?: () => boolean;
}

/** One line adjoining the input, with the visible transcript underlined. */
export class AgentTabsComponent implements Component {
	private readonly options: AgentTabsOptions;

	constructor(options: AgentTabsOptions) {
		this.options = options;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const agents = this.options.getAgents();
		if (width <= 0 || agents.length === 0 || this.options.isVisible?.() === false) return [];

		const sessionName = sanitizeTerminalLabel(this.options.getMainTitle() ?? "");
		const tabs = [
			{ id: undefined, title: sessionName ? `Main (${sessionName})` : "Main" },
			...agents.map((agent) => ({ id: agent.id, title: sanitizeTerminalLabel(agent.title) || "Agent" })),
		];
		const selectedId = this.options.getSelectedId();
		const selectedIndex = Math.max(
			0,
			tabs.findIndex((tab) => tab.id === selectedId),
		);
		const maxLabelWidth = Math.max(6, Math.min(22, Math.floor((width - 4) / Math.min(tabs.length, 3)) - 2));
		const labels = tabs.map((tab) => truncateTabTitle(tab.title, maxLabelWidth));
		let start = 0;
		let end = tabs.length;
		const fits = (from: number, to: number): boolean =>
			visibleWidth(labels.slice(from, to).join("  ")) + 2 + (from > 0 ? 2 : 0) + (to < tabs.length ? 2 : 0) <= width;
		while (!fits(start, end) && end - start > 1) {
			if (selectedIndex - start > end - selectedIndex - 1) start++;
			else end--;
		}

		const cramped = !fits(start, end);
		const visibleLabels = cramped
			? [truncateTabTitle(labels[selectedIndex] ?? "", Math.max(0, width - 2))]
			: labels.slice(start, end);
		const pieces = [
			!cramped && start > 0 ? theme.fg("dim", "‹") : "",
			...visibleLabels.map((label, offset) => {
				const index = start + offset;
				return cramped || index === selectedIndex
					? `\x1b[4m${theme.fg("text", label)}\x1b[24m`
					: theme.fg("muted", label);
			}),
			!cramped && end < tabs.length ? theme.fg("dim", "›") : "",
		].filter((piece) => piece.length > 0);
		const content = `${" ".repeat(Math.min(2, Math.max(0, width - 1)))}${pieces.join("  ")}`;
		return [theme.bg("inputBg", content + " ".repeat(Math.max(0, width - visibleWidth(content))))];
	}
}
