import { setKeybindings, type TUI } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../../../src/core/keybindings.ts";
import { ModelSelectorComponent } from "../../../src/modes/interactive/components/model-selector.ts";
import { initTheme } from "../../../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../../../src/utils/ansi.ts";
import { createHarness, type Harness } from "../harness.ts";

function createFakeTui(): TUI {
	return { requestRender: () => {} } as unknown as TUI;
}

describe("model selector filter resets selection to top", () => {
	const harnesses: Harness[] = [];

	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	afterAll(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	// The model menu no longer has a search box, so a query arrives pre-set through
	// `/model <query>` instead of being typed into the menu. It runs the same
	// `filterModels` reset this regression guards: the selection must land on the first
	// matching row rather than staying where it was before the list narrowed.

	it("selects the first row in the All tab for a query", async () => {
		const harness = await createHarness({
			models: [
				{ id: "alpha-1", name: "Alpha One", reasoning: true },
				{ id: "alpha-2", name: "Alpha Two", reasoning: true },
				{ id: "alpha-3", name: "Alpha Three", reasoning: true },
				{ id: "beta-1", name: "Beta One", reasoning: true },
			],
		});
		harnesses.push(harness);

		const current = harness.getModel("alpha-1")!;
		const selector = new ModelSelectorComponent(
			createFakeTui(),
			current,
			harness.session.modelRuntime,
			[],
			() => {},
			() => {},
			"alpha",
		);

		// The catalog refresh runs in the background. Wait for its in-flight indicator to
		// clear so the list has settled before asserting on the selection.
		await vi.waitFor(() => {
			const rendered = stripAnsi(selector.render(120).join("\n"));
			expect(rendered).not.toContain("Refreshing model catalogs…");
		});

		// Scrolling within the filtered list still works and still keeps the row.
		selector.handleInput("\x1b[B");
		selector.handleInput("\x1b[B");
		expect(selector.getSelectedModel()?.id).toBe("alpha-3");
		selector.handleInput("\x1b[A");
		selector.handleInput("\x1b[A");
		expect(selector.getSelectedModel()?.id).toBe("alpha-1");

		// Sanity: the filter actually narrowed the list.
		expect(stripAnsi(selector.render(120).join("\n"))).not.toContain("beta-1");
	});

	it("selects the first row in the Scoped tab for a query", async () => {
		const harness = await createHarness({
			models: [
				{ id: "alpha-1", name: "Alpha One", reasoning: true },
				{ id: "alpha-2", name: "Alpha Two", reasoning: true },
				{ id: "alpha-3", name: "Alpha Three", reasoning: true },
			],
		});
		harnesses.push(harness);

		const alpha1 = harness.getModel("alpha-1")!;
		const alpha2 = harness.getModel("alpha-2")!;
		const alpha3 = harness.getModel("alpha-3")!;

		// Scoped list is intentionally not in current-model-first order; the
		// current model (alpha-1) sits at index 2.
		const selector = new ModelSelectorComponent(
			createFakeTui(),
			alpha1,
			harness.session.modelRuntime,
			[{ model: alpha2 }, { model: alpha3 }, { model: alpha1 }],
			() => {},
			() => {},
			"alpha",
		);

		// The catalog refresh runs in the background. Wait for its in-flight indicator to
		// clear so the list has settled before asserting on the selection.
		await vi.waitFor(() => {
			const rendered = stripAnsi(selector.render(120).join("\n"));
			expect(rendered).not.toContain("Refreshing model catalogs…");
		});

		// Selection must be the top row of the filtered scoped list (alpha-2), not
		// stay clamped at index 2 (alpha-1), which is where the current model sits.
		expect(selector.getSelectedModel()?.id).toBe("alpha-2");
	});
});
