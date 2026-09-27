import { setKeybindings } from "@earendil-works/pi-tui";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { ThinkingSelectorComponent } from "../src/modes/interactive/components/thinking-selector.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

/**
 * The opening SGR sequence a token emits, taken from a render of a sentinel character so
 * the assertion does not hardcode an ANSI code that a theme change would invalidate.
 */
function openingEscape(render: (text: string) => string): string {
	const sentinel = "\u0000";
	return render(sentinel).split(sentinel)[0]!;
}

describe("thinking selector", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	it("numbers the levels and keeps the current one marked while browsing", () => {
		const selector = new ThinkingSelectorComponent(
			"medium",
			["medium", "high"],
			() => {},
			() => {},
		);
		const rendered = (): string[] =>
			selector
				.getSelectList()
				.render(80)
				.map((line) => stripAnsi(line));

		expect(stripAnsi(selector.getSelectList().getSelectedItem()?.label ?? "")).toBe("1. Medium (current)");
		expect(rendered().some((line) => line.includes("1. Medium (current)"))).toBe(true);
		expect(rendered().some((line) => line.includes("2. High"))).toBe(true);

		selector.handleInput("\x1b[B");
		expect(stripAnsi(selector.getSelectList().getSelectedItem()?.label ?? "")).toBe("2. High");
	});

	it("titles the picker with the model and describes each level", () => {
		const selector = new ThinkingSelectorComponent(
			"high",
			["low", "medium", "high"],
			() => {},
			() => {},
			undefined,
			"medium",
			"gpt-5.1",
		);
		const selected = stripAnsi(selector.render(80).join("\n"));

		expect(selected).toContain("Select Reasoning Level for gpt-5.1");
		expect(selected).toContain("2. Medium (default)");
		expect(selected).toContain("3. High (current)");
		expect(selected).toContain("Greater reasoning depth for complex problems");
	});

	it("marks the selected row with the arrow and accent text, not a background", () => {
		const selector = new ThinkingSelectorComponent(
			"medium",
			["low", "medium", "high"],
			() => {},
			() => {},
		);
		const rawRows = (): string[] => selector.getSelectList().render(80);

		// The list opens on the current level, which is the second of these rows.
		const selected = rawRows().find((line) => stripAnsi(line).includes("2. Medium"))!;
		expect(stripAnsi(selected)).toMatch(/^> 2\. Medium \(current\)/);
		// The accent color is the point of the selection styling; an earlier override
		// replaced it with plain bold, which is the regression this guards.
		expect(selected).toContain(openingEscape((text) => theme.fg("accent", text)));
		expect(selected).not.toContain(openingEscape((text) => theme.bg("selectedBg", text)));

		// Non-selected rows carry the blank marker so the column stays aligned.
		const unselected = rawRows().find((line) => stripAnsi(line).includes("1. Low"))!;
		expect(stripAnsi(unselected)).toMatch(/^ {2}1\. Low/);
	});

	it("names every level without inventing phrases", () => {
		const selector = new ThinkingSelectorComponent(
			"medium",
			["off", "minimal", "low", "medium", "high", "xhigh", "max"],
			() => {},
			() => {},
		);
		const rendered = stripAnsi(selector.getSelectList().render(120).join("\n"));

		expect(rendered).toContain("6. Extra-high");
		expect(rendered).toContain("7. Maximum");
		expect(rendered).not.toContain("More reasoning");
	});

	it("uses the configured save binding", () => {
		setKeybindings(new KeybindingsManager({ "app.thinking.save": "ctrl+r" }));
		const saveDefault = vi.fn();
		const selector = new ThinkingSelectorComponent(
			"medium",
			["medium", "high"],
			() => {},
			() => {},
			saveDefault,
		);

		selector.handleInput("\x13");
		expect(saveDefault).not.toHaveBeenCalled();
		selector.handleInput("\x12");
		expect(saveDefault).toHaveBeenCalledWith("medium");
	});
});
