import type { Component } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

/** Format a completed run duration for the transcript summary bar. */
export function formatWorkedDuration(durationMs: number): string {
	const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

/** Format a token count compactly without unnecessary trailing zeroes. */
export function formatWorkedTokens(count: number): string {
	if (count < 1_000) return count.toString();
	if (count < 1_000_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

/** A full-width, dim separator showing how long the completed run took. */
export class WorkedDurationComponent implements Component {
	private readonly durationMs: number;
	private readonly tokenCount: number;

	constructor(durationMs: number, tokenCount: number) {
		this.durationMs = durationMs;
		this.tokenCount = tokenCount;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) return [""];

		const label = `─ Worked for ${formatWorkedDuration(this.durationMs)} · ${formatWorkedTokens(this.tokenCount)} tokens `;
		const line = label.length >= width ? label.slice(0, width) : label + "─".repeat(width - label.length);
		return [theme.fg("dim", line)];
	}
}
