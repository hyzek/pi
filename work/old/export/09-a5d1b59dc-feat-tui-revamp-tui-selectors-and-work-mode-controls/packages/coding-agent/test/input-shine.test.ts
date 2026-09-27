import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	createInputShine,
	createInputShineBackground,
	createInputShinePlaceholderStyle,
	shouldPlayMaxShine,
} from "../src/modes/interactive/theme/input-shine.ts";
import {
	initTheme,
	loadThemeFromPath,
	relativeLuminance,
	setThemeInstance,
	theme,
} from "../src/modes/interactive/theme/theme.ts";

const themePath = (name: string) =>
	fileURLToPath(new URL(`../src/modes/interactive/theme/${name}.json`, import.meta.url));

const TRUECOLOR_BG = /^\x1b\[48;2;(\d+);(\d+);(\d+)m$/;

/** Pull the channels out of a truecolor background escape produced by blendBgAnsi. */
function bgRgb(ansi: string): { r: number; g: number; b: number } {
	const match = TRUECOLOR_BG.exec(ansi);
	if (!match) throw new Error(`not a truecolor background: ${JSON.stringify(ansi)}`);
	return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

describe("relativeLuminance", () => {
	it("reports the extremes", () => {
		expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
		expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
	});

	it("separates the two built-in input fills", () => {
		// This is what decides which way the shine blends.
		expect(relativeLuminance("#3c3c3c")).toBeLessThan(0.5); // dark inputBg
		expect(relativeLuminance("#e7e7ea")).toBeGreaterThan(0.5); // light inputBg
	});
});

describe("Theme color blending", () => {
	it("returns the unblended color at amount 0", () => {
		const dark = loadThemeFromPath(themePath("dark"), "truecolor");
		expect(dark.blendBgAnsi("inputBg", "#ffffff", 0)).toBe(dark.getBgAnsi("inputBg"));
		expect(dark.blendFg("muted", "#ffffff", 0, "x")).toBe(dark.fg("muted", "x"));
	});

	it("lightens a dark fill and darkens a light one", () => {
		const dark = loadThemeFromPath(themePath("dark"), "truecolor");
		const darkBase = bgRgb(dark.getBgAnsi("inputBg"));
		expect(bgRgb(dark.blendBgAnsi("inputBg", "#ffffff", 1)).r).toBeGreaterThan(darkBase.r);

		const light = loadThemeFromPath(themePath("light"), "truecolor");
		const lightBase = bgRgb(light.getBgAnsi("inputBg"));
		expect(bgRgb(light.blendBgAnsi("inputBg", "#3c3c3c", 1)).r).toBeLessThan(lightBase.r);
	});

	it("blends monotonically", () => {
		const dark = loadThemeFromPath(themePath("dark"), "truecolor");
		const red = (amount: number) => bgRgb(dark.blendBgAnsi("inputBg", "#ffffff", amount)).r;
		expect(red(0.25)).toBeLessThan(red(0.5));
		expect(red(0.5)).toBeLessThan(red(0.75));
	});

	it("falls back to the unblended color for a target that is not a hex value", () => {
		// A 256-color-index token takes the same branch, so a custom theme degrades to
		// "no blend" rather than throwing.
		const dark = loadThemeFromPath(themePath("dark"), "truecolor");
		expect(dark.blendBgAnsi("inputBg", "not-a-color", 0.5)).toBe(dark.getBgAnsi("inputBg"));
		expect(dark.blendFg("muted", "not-a-color", 0.5, "x")).toBe(dark.fg("muted", "x"));
	});

	it("keeps the raw registered value available", () => {
		const dark = loadThemeFromPath(themePath("dark"), "truecolor");
		expect(dark.getRawColor("inputBg")).toBe("#3c3c3c");
	});
});

describe("input shine colors", () => {
	it("rests at the unblended block background", () => {
		initTheme("dark", false);
		const background = createInputShineBackground();
		expect(background(0)).toBe(theme.getBgAnsi("inputBg"));
	});

	it("lightens the block as intensity rises, staying short of near-white", () => {
		initTheme("dark", false);
		const background = createInputShineBackground();
		const base = bgRgb(background(0));
		const half = bgRgb(background(0.5));
		const peak = bgRgb(background(1));

		expect(half.r).toBeGreaterThan(base.r);
		expect(peak.r).toBeGreaterThan(half.r);
		// The working indicator sweeps up to grayscale 255; this is deliberately a glint.
		expect(peak.r).toBeLessThan(160);
	});

	it("darkens the block on the light theme", () => {
		initTheme("light", false);
		const background = createInputShineBackground();
		expect(bgRgb(background(1)).r).toBeLessThan(bgRgb(background(0)).r);
	});

	it("rests at exactly the muted placeholder color", () => {
		initTheme("dark", false);
		const style = createInputShinePlaceholderStyle();
		// Byte-identical to the plain `theme.fg("muted", text)` this replaced, so an idle
		// input box renders exactly as it did before.
		expect(style("Ask flux anything", 0)).toBe(theme.fg("muted", "Ask flux anything"));
		expect(style("Ask flux anything")).toBe(theme.fg("muted", "Ask flux anything"));
	});

	it("brightens the placeholder inside the band so it stays legible", () => {
		initTheme("dark", false);
		const style = createInputShinePlaceholderStyle();
		const peak = style("x", 1);
		expect(peak).not.toBe(theme.fg("muted", "x"));
		expect(peak).toContain("x");
	});
});

describe("shouldPlayMaxShine", () => {
	it("fires on a real transition into max", () => {
		expect(shouldPlayMaxShine("high", "max")).toBe(true);
		expect(shouldPlayMaxShine("off", "max")).toBe(true);
		expect(shouldPlayMaxShine("xhigh", "max")).toBe(true);
		expect(shouldPlayMaxShine(undefined, "max")).toBe(true);
	});

	it("stays quiet when max is already active", () => {
		// Re-confirming max in /effort must not replay the glint.
		expect(shouldPlayMaxShine("max", "max")).toBe(false);
	});

	it("stays quiet on every other change", () => {
		expect(shouldPlayMaxShine("max", "high")).toBe(false);
		expect(shouldPlayMaxShine("max", "off")).toBe(false);
		expect(shouldPlayMaxShine("high", "xhigh")).toBe(false);
		// Requesting max on a model without it clamps to another level. `next` is the session's
		// level *after* clamping, never the requested one, so this must not fire.
		expect(shouldPlayMaxShine("high", "high")).toBe(false);
	});
});

describe("input shine variants", () => {
	it("plays the neutral glint until told otherwise", () => {
		initTheme("dark", false);
		const shine = createInputShine();
		const neutral = createInputShineBackground();
		// The launch glint must not change color: byte-identical at rest and at the peak.
		expect(shine.background(0)).toBe(neutral(0));
		expect(shine.background(1)).toBe(neutral(1));
	});

	it("retints the block toward max effort's color", () => {
		initTheme("dark", false);
		const shine = createInputShine();
		const base = bgRgb(shine.background(0));
		const neutralPeak = bgRgb(shine.background(1));

		shine.setVariant("max");
		const peak = bgRgb(shine.background(1));

		// thinkingMax is #ff5f3c on the dark theme, so both warm channels rise off the #3c3c3c fill
		// (r 60->142, g 60->75, b stays 60)...
		expect(peak.r).toBeGreaterThan(base.r);
		expect(peak.g).toBeGreaterThan(base.g);
		// ...and the result is red-dominant, where the neutral glint is pure gray.
		expect(peak.r).toBeGreaterThan(peak.g);
		expect(peak.g).toBeGreaterThan(peak.b);
		expect(peak.r - peak.g).toBeGreaterThan(neutralPeak.r - neutralPeak.g);
	});

	it("darkens the block toward max effort's color on the light theme", () => {
		initTheme("light", false);
		const shine = createInputShine();
		const base = bgRgb(shine.background(0));
		shine.setVariant("max");
		const peak = bgRgb(shine.background(1));
		expect(peak.r).toBeLessThan(base.r);
		expect(peak.r).toBeGreaterThan(peak.g); // warm, not merely darker
	});

	it("returns to the neutral glint when the variant is reset", () => {
		initTheme("dark", false);
		const shine = createInputShine();
		const neutral = bgRgb(shine.background(1));
		shine.setVariant("max");
		expect(bgRgb(shine.background(1))).not.toEqual(neutral);
		shine.setVariant("default");
		expect(bgRgb(shine.background(1))).toEqual(neutral);
	});

	it("still glints when the effort color cannot be blended", () => {
		const dark = loadThemeFromPath(themePath("dark"), "truecolor");
		setThemeInstance(dark);
		const shine = createInputShine();
		const neutralPeak = shine.background(1);

		// A named color (or a 256-color index) cannot be mixed. The glint must fall back to the
		// neutral target rather than emit an unblended, invisible band. The raw map is private but
		// a plain Map at runtime, which is the seam `getRawColor` reads.
		(dark as unknown as { fgRawColors: Map<string, string | number> }).fgRawColors.set("thinkingMax", "red");
		shine.setVariant("max");
		expect(shine.background(1)).toBe(neutralPeak);

		initTheme("dark", false); // restore the global theme for any later test
	});

	it("leaves the placeholder styling untouched", () => {
		initTheme("dark", false);
		const shine = createInputShine();
		shine.setVariant("max");
		// Blending the foreground toward the effort color would put red text on a red band, so the
		// max variant deliberately shares the neutral fg fade.
		expect(shine.placeholderStyle("Ask flux anything", 0)).toBe(theme.fg("muted", "Ask flux anything"));
		expect(shine.placeholderStyle("x", 1)).toBe(createInputShinePlaceholderStyle()("x", 1));
	});
});
