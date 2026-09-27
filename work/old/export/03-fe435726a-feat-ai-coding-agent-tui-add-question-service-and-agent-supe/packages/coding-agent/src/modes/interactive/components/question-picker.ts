import {
	Container,
	type Focusable,
	Input,
	Spacer,
	Text,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { KeybindingsManager } from "../../../core/keybindings.ts";
import { QuestionPickerState } from "../../../core/question-picker-state.ts";
import {
	type AskUserResponse,
	QUESTION_CUSTOM_OPTION_ID,
	type QuestionRequest,
} from "../../../core/question-service.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint } from "./keybinding-hints.ts";

export class QuestionPickerComponent extends Container implements Focusable {
	private readonly tui: TUI;
	private readonly keybindings: KeybindingsManager;
	private readonly state: QuestionPickerState;
	private readonly input: Input;
	private readonly done: (response: AskUserResponse) => void;
	private focusedValue = false;
	private scrollOffset = 0;

	get focused(): boolean {
		return this.focusedValue;
	}

	set focused(value: boolean) {
		this.focusedValue = value;
		this.input.focused = value && this.state.customInput;
	}

	constructor(
		request: QuestionRequest,
		tui: TUI,
		keybindings: KeybindingsManager,
		done: (response: AskUserResponse) => void,
	) {
		super();
		this.tui = tui;
		this.keybindings = keybindings;
		this.state = new QuestionPickerState(request);
		this.done = done;
		this.input = new Input({ prompt: "  ", placeholder: "Type your answer" });
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold("Question")), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - this.getViewportLines());
			this.refresh();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.scrollOffset += this.getViewportLines();
			this.refresh();
			return;
		}

		if (this.state.customInput) {
			if (this.keybindings.matches(data, "tui.select.cancel")) {
				this.state.goBack();
				this.refresh();
				return;
			}
			if (this.keybindings.matches(data, "tui.input.submit")) {
				const transition = this.state.submitCustomText(this.input.getValue());
				if (transition.type === "invalid") {
					this.refresh();
					return;
				}
				this.input.setValue("");
				this.input.focused = false;
				this.applyTransition(transition);
				return;
			}
			this.input.handleInput(data);
			this.refresh();
			return;
		}

		if (this.keybindings.matches(data, "tui.select.up")) {
			if (this.state.screen === "review") this.state.moveReview(-1);
			else this.state.moveOption(-1);
			this.refresh();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			if (this.state.screen === "review") this.state.moveReview(1);
			else this.state.moveOption(1);
			this.refresh();
			return;
		}
		if (this.keybindings.matches(data, "app.question.back")) {
			this.state.goBack();
			this.refresh();
			return;
		}
		if (this.keybindings.matches(data, "app.question.forward")) {
			this.applyTransition(this.state.goForward());
			return;
		}
		if (this.keybindings.matches(data, "app.question.review")) {
			if (this.state.allAnswered) {
				this.state.screen = "review";
				this.state.reviewIndex = 0;
			}
			this.refresh();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			this.applyTransition(this.state.confirm());
			return;
		}
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.done({ status: "cancelled", reason: "user" });
		}
	}

	invalidate(): void {
		this.refresh();
	}

	dispose(): void {}

	private applyTransition(transition: ReturnType<QuestionPickerState["confirm"]>): void {
		if (transition.type === "custom-input") {
			this.input.setValue(transition.value);
			this.input.focused = this.focusedValue;
		}
		if (transition.type === "submitted") this.done(transition.response);
		this.refresh();
	}

	private refresh(): void {
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 2);
		const lines: string[] = [];
		const wrap = (prefix: string, value: string, color: (text: string) => string = (text) => text): void => {
			const prefixWidth = visibleWidth(prefix);
			const wrapped = wrapTextWithAnsi(color(value), Math.max(1, contentWidth - prefixWidth));
			for (const [index, line] of wrapped.entries()) {
				lines.push(`${index === 0 ? prefix : " ".repeat(prefixWidth)}${line}`);
			}
		};

		if (this.state.screen === "review") {
			wrap(" ", `Review answers (${this.state.answerCount}/${this.state.request.questions.length})`, (text) =>
				theme.bold(theme.fg("accent", text)),
			);
			lines.push("");
			this.state.request.questions.forEach((question, index) => {
				const answer = this.state.getAnswer(question.id);
				const selected = index === this.state.reviewIndex;
				const prefix = selected ? theme.fg("accent", "> ") : "  ";
				const value = answer?.optionId === QUESTION_CUSTOM_OPTION_ID ? answer.customText : answer?.label;
				wrap(prefix, `${question.header}: ${value ?? "Unanswered"}`, (text) =>
					selected ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg("text", text),
				);
			});
			const submitSelected = this.state.reviewIndex === this.state.request.questions.length;
			wrap(submitSelected ? theme.fg("accent", "> ") : "  ", "Submit answers", (text) =>
				submitSelected ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg("success", text),
			);
			lines.push("");
			wrap(" ", "Enter edits the selected answer or submits the batch.", (text) => theme.fg("muted", text));
		} else {
			const question = this.state.currentQuestion;
			if (!question) return lines;
			wrap(
				" ",
				`${question.header}  Question ${this.state.questionIndex + 1} of ${this.state.request.questions.length}`,
				(text) => theme.bold(theme.fg("accent", text)),
			);
			lines.push("");
			wrap(" ", question.prompt, (text) => theme.fg("text", text));
			lines.push("");
			question.options.forEach((option, index) => {
				const selected = index === this.state.optionIndex;
				const prefix = selected ? theme.fg("accent", "> ") : "  ";
				const label = `${index + 1}. ${option.label}${option.recommended ? " (Recommended)" : ""}`;
				wrap(prefix, label, (text) =>
					selected ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg("text", text),
				);
				wrap("     ", option.description, (text) => theme.fg("muted", text));
			});
			if (this.state.customInput) {
				lines.push("");
				wrap(" ", "Your answer", (text) => theme.fg("accent", text));
				for (const line of this.input.render(Math.max(1, contentWidth - 1))) {
					lines.push(` ${theme.bg("inputBg", line)}`);
				}
				if (this.state.customError) wrap(" ", this.state.customError, (text) => theme.fg("warning", text));
			}
		}

		lines.push("");
		const footer =
			this.state.screen === "review"
				? `${keyHint("tui.select.up", "navigate")}  ${keyHint("tui.select.confirm", "edit/submit")}  ${keyHint("tui.select.cancel", "cancel")}`
				: `${keyHint("tui.select.up", "navigate")}  ${keyHint("tui.select.confirm", "select")}  ${keyHint("app.question.back", "back")}  ${keyHint("tui.select.cancel", "cancel")}`;
		wrap(" ", footer, (text) => theme.fg("dim", text));
		lines.push(theme.fg("borderAccent", "─".repeat(Math.max(1, contentWidth))));

		const viewportLines = this.getViewportLines();
		if (lines.length <= viewportLines) {
			this.scrollOffset = 0;
			return lines;
		}
		const maxOffset = lines.length - viewportLines;
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const visible = lines.slice(this.scrollOffset, this.scrollOffset + viewportLines);
		if (this.scrollOffset > 0) visible[0] = theme.fg("dim", "↑ more");
		if (this.scrollOffset < maxOffset) visible[visible.length - 1] = theme.fg("dim", "↓ more");
		return visible;
	}

	private getViewportLines(): number {
		const terminalRows = this.tui.terminal?.rows;
		return Math.max(8, (terminalRows ?? 24) - 2);
	}
}
