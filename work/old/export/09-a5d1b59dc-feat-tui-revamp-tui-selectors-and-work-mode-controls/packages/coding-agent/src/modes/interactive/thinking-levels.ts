import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

/**
 * Display names for reasoning levels, for the effort picker.
 *
 * The `/settings` thinking submenu describes the same levels by token budget instead,
 * because there the level is a persistent default rather than a one-shot choice.
 */
export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra-high",
	max: "Maximum",
};

/** One-line explanation of what each reasoning level buys you, shown beside the level. */
export const THINKING_LEVEL_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Minimal reasoning for simple tasks",
	low: "Fast responses with lighter reasoning",
	medium: "Balances speed and reasoning depth for everyday tasks",
	high: "Greater reasoning depth for complex problems",
	xhigh: "Extra high reasoning depth for complex problems",
	max: "Max consumes usage limits faster",
};
