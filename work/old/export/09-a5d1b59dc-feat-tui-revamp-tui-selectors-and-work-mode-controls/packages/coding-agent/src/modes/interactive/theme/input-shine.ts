// Colors for the input box's one-shot shine. The editor owns the geometry and the
// timing; these factories only answer "what color is intensity N", so all theme knowledge
// stays on this side of the package boundary.
//
// The block glint is deliberately softer than the working indicator's sweep (which runs the
// grayscale ramp 244->255, i.e. gray to near-white): that effect repeats every second on the
// terminal background, while this one fires once on the input block's own gray fill.
//
// It plays on launch, and again — recolored to the effort color — whenever reasoning effort
// becomes "max". See `createInputShine` for the variant state and `shouldPlayMaxShine` for the
// trigger rule.

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { relativeLuminance, theme } from "./theme.ts";

/** Peak blend of the block background toward the shine target. Tune by eye: 0.30 subtle .. 0.55 bold. */
export const INPUT_SHINE_BG_PEAK = 0.42;
/** Peak fade of the placeholder foreground toward the normal text color. */
export const INPUT_SHINE_FG_PEAK = 0.75;

// Dark blocks glint brighter; light blocks glint darker, since blending a light fill toward
// white is invisible (~#e7e7ea -> #f2f2f4 is a no-op to the eye).
const DARK_TARGET = "#ffffff";
const LIGHT_TARGET = "#3c3c3c";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Which palette a glint uses: the neutral launch glint, or max effort's own color. */
export type InputShineVariant = "default" | "max";

/**
 * Whether the max-effort glint should play. Only on a real transition into "max" — re-confirming
 * max while it is already active must not replay.
 *
 * `next` must be the *effective* level (the session's level after clamping), not the requested
 * one: picking "max" on a model that does not support it clamps to "high" and must stay silent.
 */
export function shouldPlayMaxShine(previous: ThinkingLevel | undefined, next: ThinkingLevel | undefined): boolean {
	return next === "max" && previous !== "max";
}

/** Pick the blend direction from the block's own brightness, so custom themes work too. */
function resolveTarget(raw: string | number | undefined): string {
	if (typeof raw !== "string" || !HEX_COLOR.test(raw)) return DARK_TARGET;
	return relativeLuminance(raw) > 0.5 ? LIGHT_TARGET : DARK_TARGET;
}

/**
 * Blend target for the max-effort variant: the effort color itself. The theme resolves
 * `thinkingMax` against `thinkingXhigh` when it is omitted, so legacy themes get a hex here too.
 * A theme storing it as a named color or 256-color index cannot be blended, so fall back to the
 * plain target — the glint then plays untinted rather than not at all.
 */
function resolveMaxTarget(): string {
	const raw = theme.getRawColor("thinkingMax");
	if (typeof raw === "string" && HEX_COLOR.test(raw)) return raw;
	return resolveTarget(theme.getRawColor("inputBg"));
}

/**
 * `background` callback for `EditorOptions.blockShine`. Re-reads the theme on every call so a
 * theme swap mid-animation is picked up; no cross-frame color cache.
 */
export function createInputShineBackground(
	getVariant: () => InputShineVariant = () => "default",
): (intensity: number) => string {
	let cachedRaw: string | number | undefined;
	let cachedVariant: InputShineVariant | undefined;
	let target = DARK_TARGET;
	return (intensity: number) => {
		const raw = theme.getRawColor("inputBg");
		const variant = getVariant();
		if (raw !== cachedRaw || variant !== cachedVariant) {
			cachedRaw = raw;
			cachedVariant = variant;
			target = variant === "max" ? resolveMaxTarget() : resolveTarget(raw);
		}
		return theme.blendBgAnsi("inputBg", target, intensity * INPUT_SHINE_BG_PEAK);
	};
}

/**
 * `placeholderStyle` for the input box: muted at rest, fading toward the normal text color
 * inside the band. The foreground must brighten with the background — muted (#808080) on a
 * lightened block is barely 1.2:1 contrast, so a background-only shine would wash the
 * placeholder out exactly when the glint is at its peak.
 */
export function createInputShinePlaceholderStyle(): (text: string, shine?: number) => string {
	let cachedRaw: string | number | undefined;
	let target: string | undefined;
	return (text: string, shine = 0) => {
		const raw = theme.getRawColor("text");
		if (raw !== cachedRaw) {
			cachedRaw = raw;
			target = typeof raw === "string" && HEX_COLOR.test(raw) ? raw : undefined;
		}
		if (shine <= 0 || target === undefined) return theme.fg("muted", text);
		return theme.blendFg("muted", target, shine * INPUT_SHINE_FG_PEAK, text);
	};
}

/**
 * The input box's glint callbacks, sharing one variant. The editor holds these by reference and
 * re-reads `background` on every row of every render, so `setVariant` retints a glint that is
 * already in flight — pick the variant *before* calling `startBlockShine`.
 */
export interface InputShine {
	background: (intensity: number) => string;
	placeholderStyle: (text: string, shine?: number) => string;
	setVariant(variant: InputShineVariant): void;
}

export function createInputShine(): InputShine {
	let variant: InputShineVariant = "default";
	return {
		background: createInputShineBackground(() => variant),
		// Deliberately variant-independent: it keeps brightening the placeholder toward the normal
		// text color, because blending it toward the effort color would put red text on a red band.
		placeholderStyle: createInputShinePlaceholderStyle(),
		setVariant(next: InputShineVariant): void {
			variant = next;
		},
	};
}
