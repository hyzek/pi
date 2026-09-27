import type { Model } from "@earendil-works/pi-ai";

/**
 * Formats a token count for the model list's right-hand column, e.g. `200k`, `1M`.
 * Returns undefined when the model does not declare a context window.
 */
function formatContextWindow(contextWindow: number | undefined): string | undefined {
	if (!contextWindow || contextWindow <= 0) return undefined;
	if (contextWindow >= 1_000_000) {
		const millions = contextWindow / 1_000_000;
		return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M context`;
	}
	if (contextWindow >= 1_000) {
		const thousands = contextWindow / 1_000;
		return `${Number.isInteger(thousands) ? thousands : Math.round(thousands)}k context`;
	}
	return `${contextWindow} context`;
}

/** Formats a per-Mtok rate, trimming trailing zeros so `3.00` reads as `3`. */
function formatRate(rate: number | undefined): string {
	if (rate === undefined || rate <= 0) return "0";
	return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}

/**
 * One-line summary of a model for the selector's right column. The model record has no
 * human-written description, so this is synthesized from the metadata we do carry:
 * context window, price, and whether the model reasons.
 */
export function formatModelDescription(model: Model<any>): string {
	const parts: string[] = [];

	const context = formatContextWindow(model.contextWindow);
	if (context) parts.push(context);

	const input = model.cost?.input ?? 0;
	const output = model.cost?.output ?? 0;
	parts.push(input === 0 && output === 0 ? "free" : `$${formatRate(input)}/$${formatRate(output)} per Mtok`);

	if (model.reasoning) parts.push("reasoning");

	return parts.join(" · ");
}
