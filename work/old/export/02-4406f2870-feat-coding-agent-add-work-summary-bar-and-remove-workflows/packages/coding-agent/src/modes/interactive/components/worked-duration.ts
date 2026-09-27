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

/** A full-width, dim separator showing how long the completed run took. */
export class WorkedDurationComponent implements Component {
	private readonly durationMs: number;

	constructor(durationMs: number) {
		this.durationMs = durationMs;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) return [""];

		const label = `─ Worked for ${formatWorkedDuration(this.durationMs)} `;
		const line = label.length >= width ? label.slice(0, width) : label + "─".repeat(width - label.length);
		return [theme.fg("dim", line)];
	}
}
