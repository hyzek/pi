import { isAbsolute, relative, resolve, sep } from "node:path";
import { type Component, truncateToWidth } from "@earendil-works/pi-tui";
import type { AgentSession } from "../../../core/agent-session.ts";
import type { AgentChildSnapshot } from "../../../core/agent-supervisor.ts";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.ts";
import { sanitizeTerminalLabel } from "../../../utils/ansi.ts";
import { theme } from "../theme/theme.ts";

/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function sanitizeStatusText(text: string): string {
	// Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Format token counts for compact footer display.
 */
export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function formatAgentTokenVolume(snapshot: AgentChildSnapshot): string {
	const tokens = snapshot.usage.input + snapshot.usage.output + snapshot.usage.cacheRead + snapshot.usage.cacheWrite;
	return `${snapshot.usageEstimated ? "~" : ""}${formatTokens(tokens)} tokens`;
}

/**
 * Compact footer showing permission mode, main model, context capacity, and extension warnings.
 */
export class FooterComponent implements Component {
	private session: AgentSession;
	private footerData: ReadonlyFooterDataProvider;
	private requestRender?: () => void;
	private unsubscribeAgentSupervisor?: () => void;
	private selectedChildId: string | undefined;

	constructor(session: AgentSession, footerData: ReadonlyFooterDataProvider, requestRender?: () => void) {
		this.session = session;
		this.footerData = footerData;
		this.requestRender = requestRender;
		this.bindAgentSupervisor();
	}

	setSession(session: AgentSession): void {
		this.unsubscribeAgentSupervisor?.();
		this.unsubscribeAgentSupervisor = undefined;
		this.session = session;
		this.bindAgentSupervisor();
	}

	setAutoCompactEnabled(_enabled: boolean): void {}

	setSelectedChild(id: string | undefined): void {
		this.selectedChildId = id;
		this.requestRender?.();
	}

	/**
	 * No-op: git branch caching now handled by provider.
	 * Kept for compatibility with existing call sites in interactive-mode.
	 */
	invalidate(): void {
		this.requestRender?.();
	}

	/**
	 * Clean up resources.
	 * Git watcher cleanup now handled by provider.
	 */
	dispose(): void {
		// Git watcher cleanup handled by provider
		this.unsubscribeAgentSupervisor?.();
		this.unsubscribeAgentSupervisor = undefined;
	}

	private bindAgentSupervisor(): void {
		const supervisor = this.session.agentSupervisor;
		if (!supervisor) return;
		this.unsubscribeAgentSupervisor = supervisor.subscribe(() => {
			this.requestRender?.();
		});
	}

	render(width: number): string[] {
		const state = this.session.state;
		const mode = this.session.permissionMode;
		const modeLabel = theme.getPermissionModeColor(mode)(`${theme.getPermissionModeIcon(mode)} ${mode} mode`);
		const modelPart = theme.fg("dim", state.model?.id || "no-model");
		const selectedChild = this.selectedChildId
			? this.session.agentSupervisor?.getAgentStatus().find((snapshot) => snapshot.id === this.selectedChildId)
			: undefined;
		// Only worth showing where effort is meaningful; non-reasoning models clamp to "off".
		const level = state.thinkingLevel;
		const effortPart = state.model?.reasoning ? theme.getThinkingBorderColor(level)(level) : undefined;
		const parts = [modeLabel, modelPart, effortPart];
		if (selectedChild) {
			parts.push(
				theme.fg(
					"muted",
					`${sanitizeTerminalLabel(selectedChild.title)} · ${formatAgentTokenVolume(selectedChild)}`,
				),
			);
		}
		const mainLine = `  ${parts.filter((part): part is string => part !== undefined).join("   ")}`;
		const lines = [truncateToWidth(mainLine, width, "")];

		// Add extension statuses on a single line, sorted by key alphabetically
		const extensionStatuses = this.footerData.getExtensionStatuses();
		if (extensionStatuses.size > 0) {
			const sortedStatuses = Array.from(extensionStatuses.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, text]) => sanitizeStatusText(text));
			const statusLine = `  ${sortedStatuses.join(" ")}`;
			// Truncate to terminal width with dim ellipsis for consistency with footer style
			lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
		}

		return lines;
	}
}
