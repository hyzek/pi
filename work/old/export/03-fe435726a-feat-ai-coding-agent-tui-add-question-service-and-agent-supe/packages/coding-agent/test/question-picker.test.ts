import { beforeAll, describe, expect, it } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { QuestionPickerState } from "../src/core/question-picker-state.ts";
import {
	type AskUserInput,
	type AskUserResponse,
	addCustomOptions,
	QUESTION_CUSTOM_OPTION_ID,
} from "../src/core/question-service.ts";
import { QuestionPickerComponent } from "../src/modes/interactive/components/question-picker.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

const input: AskUserInput = {
	questions: [
		{
			id: "storage",
			header: "Storage",
			prompt: "Where should task history live?",
			options: [
				{ id: "sqlite", label: "Local SQLite", description: "Structured local persistence." },
				{ id: "json", label: "JSON files", description: "Easy to inspect and copy." },
			],
		},
		{
			id: "retention",
			header: "Retention",
			prompt: "How long should history be retained?",
			options: [
				{ id: "short", label: "30 days", description: "Keeps the local store small." },
				{ id: "long", label: "Forever", description: "Preserves all history." },
			],
		},
	],
};

describe("QuestionPickerState", () => {
	it("requires every answer, reviews a batch, and edits an earlier answer", () => {
		const state = new QuestionPickerState({ ...addCustomOptions(input), requestId: "question_1" });

		expect(state.confirm()).toEqual({ type: "none" });
		expect(state.questionIndex).toBe(1);
		expect(state.confirm()).toEqual({ type: "review" });
		expect(state.screen).toBe("review");
		expect(state.confirm()).toEqual({ type: "edit", questionIndex: 0 });
		state.moveOption(1);
		state.confirm();
		state.goForward();
		state.moveReview(2);
		const result = state.confirm();
		expect(result.type).toBe("submitted");
		if (result.type === "submitted") expect(result.response.status).toBe("submitted");
	});

	it("rejects empty custom answers and preserves custom text while editing", () => {
		const state = new QuestionPickerState({ ...addCustomOptions(input), requestId: "question_2" });
		state.moveOption(2);
		expect(state.confirm()).toEqual({ type: "custom-input", value: "" });
		expect(state.submitCustomText("   ")).toEqual({ type: "invalid", message: "Custom answers cannot be empty." });
		state.submitCustomText("Keep it until I delete it");
		state.confirm();
		state.moveOption(2);
		state.confirm();
		expect(state.confirm()).toEqual({ type: "custom-input", value: "Keep it until I delete it" });
		state.goBack();
		state.goBack();
		expect(state.getAnswer("storage")?.optionId).toBe(QUESTION_CUSTOM_OPTION_ID);
		expect(state.getAnswer("storage")?.customText).toBe("Keep it until I delete it");
	});
});

describe("QuestionPickerComponent", () => {
	beforeAll(() => initTheme("dark"));

	it("cancels explicitly and wraps narrow content", () => {
		let result: AskUserResponse | undefined;
		const tui = { requestRender: () => {} } as never;
		const component = new QuestionPickerComponent(
			{ ...addCustomOptions(input), requestId: "question_3" },
			tui,
			new KeybindingsManager(),
			(response) => {
				result = response;
			},
		);

		const lines = component.render(24).map(stripAnsi);
		expect(lines.join("\n")).toContain("Question 1");
		expect(lines.some((line) => line.includes("Where should task"))).toBe(true);
		expect(lines.every((line) => line.length <= 22)).toBe(true);
		component.handleInput("\x1b");
		expect(result).toEqual({ status: "cancelled", reason: "user" });
	});
});
