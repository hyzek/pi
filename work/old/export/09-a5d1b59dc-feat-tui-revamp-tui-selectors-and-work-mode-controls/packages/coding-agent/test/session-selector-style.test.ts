import { setKeybindings } from "@earendil-works/pi-tui";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import type { SessionInfo } from "../src/core/session-manager.ts";
import { SessionSelectorComponent } from "../src/modes/interactive/components/session-selector.ts";
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

/** A `DynamicBorder` renders one full-width run of these; tree prefixes only ever emit one at a time. */
const BORDER_RULE = "─".repeat(30);

async function flushPromises(): Promise<void> {
	await new Promise<void>((resolve) => {
		setImmediate(resolve);
	});
}

function makeSession(overrides: Partial<SessionInfo> & { id: string }): SessionInfo {
	return {
		path: overrides.path ?? `/tmp/${overrides.id}.jsonl`,
		id: overrides.id,
		cwd: overrides.cwd ?? "",
		name: overrides.name,
		parentSessionPath: overrides.parentSessionPath,
		created: overrides.created ?? new Date(0),
		modified: overrides.modified ?? new Date("2026-01-02T00:00:00.000Z"),
		messageCount: overrides.messageCount ?? 1,
		firstMessage: overrides.firstMessage ?? "hello",
		allMessagesText: overrides.allMessagesText ?? overrides.firstMessage ?? "hello",
	};
}

describe("session selector menu style", () => {
	let keybindings: KeybindingsManager;

	beforeAll(() => {
		// session selector uses the global theme instance
		initTheme("dark");
	});

	beforeEach(() => {
		// Ensure test isolation: keybindings are a global singleton
		keybindings = new KeybindingsManager();
		setKeybindings(keybindings);
	});

	// Older `modified` sorts later, so listing the intended selection first keeps it at index 0.
	const twoSessions = [
		makeSession({ id: "a", firstMessage: "first session", modified: new Date("2026-01-02T00:00:00.000Z") }),
		makeSession({ id: "b", firstMessage: "second session", modified: new Date("2026-01-01T00:00:00.000Z") }),
	];

	async function renderSelector(
		sessions: SessionInfo[],
		options?: { renameSession?: (sessionPath: string, currentName: string | undefined) => Promise<void> },
	): Promise<SessionSelectorComponent> {
		const selector = new SessionSelectorComponent(
			async () => sessions,
			async () => [],
			() => {},
			() => {},
			() => {},
			() => {},
			{ keybindings, ...options },
		);
		await flushPromises();
		return selector;
	}

	it("marks the selected row with the accent `> ` chevron", async () => {
		const selector = await renderSelector(twoSessions);
		const lines = selector.render(120);

		const selected = lines.find((line) => stripAnsi(line).includes("first session"))!;
		expect(stripAnsi(selected)).toMatch(/^> /);
		expect(selected).toContain(openingEscape((text) => theme.fg("accent", text)));

		const unselected = lines.find((line) => stripAnsi(line).includes("second session"))!;
		expect(stripAnsi(unselected)).toMatch(/^ {2}/);
	});

	it("does not highlight the selected row with a background", async () => {
		const selector = await renderSelector(twoSessions);
		const output = selector.render(120).join("\n");

		expect(output).not.toContain(openingEscape((text) => theme.bg("selectedBg", text)));
	});

	it("draws no border rules of its own", async () => {
		const selector = await renderSelector(twoSessions);
		const output = selector.render(120).join("\n");

		expect(output).not.toContain(BORDER_RULE);
		expect(output).toContain("Resume Session (Current Folder)");
	});

	it("draws no border rules in rename mode either", async () => {
		const selector = await renderSelector(twoSessions, {
			renameSession: async () => {},
		});
		selector.getSessionList().onRenameSession?.(twoSessions[0]!.path);

		const output = selector.render(120).join("\n");
		expect(output).not.toContain(BORDER_RULE);
		expect(output).toContain("Rename Session");
	});

	it("keeps the semantic tints on unselected rows", async () => {
		const selector = await renderSelector([
			makeSession({ id: "a", firstMessage: "first session", modified: new Date("2026-01-02T00:00:00.000Z") }),
			makeSession({
				id: "b",
				name: "My Session",
				modified: new Date("2026-01-01T00:00:00.000Z"),
			}),
		]);
		const lines = selector.render(120);

		// The selected row is accent either way; the named row below it is not selected, so its
		// warning tint must survive the accent-on-select change.
		const named = lines.find((line) => stripAnsi(line).includes("My Session"))!;
		expect(named).toContain(openingEscape((text) => theme.fg("warning", text)));
	});
});
