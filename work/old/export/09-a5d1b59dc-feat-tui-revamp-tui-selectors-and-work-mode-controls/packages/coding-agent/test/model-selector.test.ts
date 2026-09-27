import { setKeybindings, type TUI } from "@earendil-works/pi-tui";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { ModelSelectorComponent } from "../src/modes/interactive/components/model-selector.ts";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

function createFakeTui(): TUI {
	return { requestRender: () => {} } as unknown as TUI;
}

/**
 * The opening SGR sequence a token emits, taken from a render of a sentinel character so
 * the assertion does not hardcode an ANSI code that a theme change would invalidate.
 */
function openingEscape(render: (text: string) => string): string {
	const sentinel = "\u0000";
	return render(sentinel).split(sentinel)[0]!;
}

describe("model selector", () => {
	let harness: Harness | undefined;

	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	afterEach(() => {
		harness?.cleanup();
		harness = undefined;
	});

	it("numbers the rows, marks the current model, and aligns the description column", async () => {
		harness = await createHarness({
			models: [
				{ id: "current-model", name: "Current Model", reasoning: true },
				{ id: "browsed-model", name: "Browsed Model", reasoning: true },
			],
		});
		const currentModel = harness.getModel("current-model")!;
		const browsedModel = harness.getModel("browsed-model")!;
		const selector = new ModelSelectorComponent(
			createFakeTui(),
			currentModel,
			harness.session.modelRuntime,
			[],
			() => {},
			() => {},
			undefined,
			undefined,
			// Marking a second model as the default sorts it directly below the current one,
			// so both rows are on screen without depending on catalog length.
			{ provider: browsedModel.provider, id: browsedModel.id },
		);

		const rows = (): string[] =>
			stripAnsi(selector.render(120).join("\n"))
				.split("\n")
				.map((line) => line.trimEnd());
		const rowFor = (prefix: string): string => rows().find((line) => line.includes(prefix))!;

		expect(stripAnsi(selector.render(120).join("\n"))).toContain("Select Model and Effort");
		expect(rowFor("1. current-model")).toMatch(
			/^> 1\. current-model \(current\) {2,}128k context · free · reasoning$/,
		);
		expect(rowFor("2. browsed-model")).toMatch(
			/^ {2}2\. browsed-model \(default\) {2,}128k context · free · reasoning$/,
		);
		// The description column starts at a fixed offset, past the padded model column.
		expect(rowFor("1. current-model").indexOf("128k")).toBe(46);

		// Browsing moves the marker without disturbing either row's layout.
		selector.handleInput("\x1b[B");
		expect(rowFor("1. current-model")).toMatch(
			/^ {2}1\. current-model \(current\) {2,}128k context · free · reasoning$/,
		);
		expect(rowFor("2. browsed-model")).toMatch(
			/^> 2\. browsed-model \(default\) {2,}128k context · free · reasoning$/,
		);
		expect(rowFor("2. browsed-model").indexOf("128k")).toBe(46);
		selector.dispose();
	});

	it("marks the selected row with the arrow and accent text, not a background", async () => {
		harness = await createHarness({
			models: [
				{ id: "current-model", name: "Current Model", reasoning: true },
				{ id: "browsed-model", name: "Browsed Model", reasoning: true },
			],
		});
		const selector = new ModelSelectorComponent(
			createFakeTui(),
			harness.getModel("current-model")!,
			harness.session.modelRuntime,
			[],
			() => {},
			() => {},
		);

		const rawRowFor = (prefix: string): string =>
			selector.render(120).find((line) => stripAnsi(line).includes(prefix))!;

		const selected = rawRowFor("1. current-model");
		expect(stripAnsi(selected)).toMatch(/^> /);
		expect(selected).toContain(openingEscape((text) => theme.fg("accent", text)));
		expect(selected).not.toContain(openingEscape((text) => theme.bg("selectedBg", text)));
		selector.dispose();
	});

	it("describes a model from its context window and price", async () => {
		harness = await createHarness({
			models: [
				{
					id: "priced-model",
					name: "Priced Model",
					contextWindow: 200_000,
					cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
				},
			],
		});
		const selector = new ModelSelectorComponent(
			createFakeTui(),
			harness.getModel(),
			harness.session.modelRuntime,
			[],
			() => {},
			() => {},
		);

		expect(stripAnsi(selector.render(120).join("\n"))).toContain("200k context · $3/$15 per Mtok");
		selector.dispose();
	});

	it("uses the configured save binding", async () => {
		setKeybindings(new KeybindingsManager({ "app.models.save": "ctrl+r" }));
		harness = await createHarness();
		const currentModel = harness.getModel()!;
		const saveDefault = vi.fn();
		const selector = new ModelSelectorComponent(
			createFakeTui(),
			currentModel,
			harness.session.modelRuntime,
			[],
			() => {},
			() => {},
			undefined,
			saveDefault,
		);

		selector.handleInput("\x13");
		expect(saveDefault).not.toHaveBeenCalled();
		selector.handleInput("\x12");
		expect(saveDefault).toHaveBeenCalledWith(currentModel);
	});

	it("lists every catalog that failed to refresh", async () => {
		harness = await createHarness();
		vi.spyOn(harness.session.modelRuntime, "refresh").mockResolvedValue({
			aborted: false,
			errors: new Map([
				["openai", new Error("unavailable")],
				["anthropic", new Error("unavailable")],
			]),
		});

		const selector = new ModelSelectorComponent(
			createFakeTui(),
			harness.getModel(),
			harness.session.modelRuntime,
			[],
			() => {},
			() => {},
		);

		await vi.waitFor(() => {
			const rendered = stripAnsi(selector.render(120).join("\n"));
			expect(rendered).toContain("Could not refresh 2 model catalogs (openai, anthropic); showing cached models.");
		});
	});
});
