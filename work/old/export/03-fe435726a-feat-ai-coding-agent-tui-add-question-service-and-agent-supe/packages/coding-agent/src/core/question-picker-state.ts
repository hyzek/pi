import {
	type AskUserResponse,
	QUESTION_CUSTOM_OPTION_ID,
	type QuestionAnswer,
	type QuestionRequest,
} from "./question-service.ts";

export type QuestionPickerScreen = "question" | "review";

export type QuestionPickerTransition =
	| { type: "none" }
	| { type: "custom-input"; value: string }
	| { type: "review" }
	| { type: "edit"; questionIndex: number }
	| { type: "submitted"; response: AskUserResponse }
	| { type: "invalid"; message: string };

/**
 * UI-independent state machine for the built-in question picker.
 *
 * The state deliberately does not own an input widget. Hosts can render the
 * custom-answer editor however they like and feed its value back through
 * submitCustomText().
 */
export class QuestionPickerState {
	readonly request: QuestionRequest;
	screen: QuestionPickerScreen = "question";
	questionIndex = 0;
	optionIndex = 0;
	reviewIndex = 0;
	customInput = false;
	customError: string | undefined;

	private readonly answers = new Map<string, QuestionAnswer>();

	constructor(request: QuestionRequest) {
		this.request = request;
		this.syncOptionToAnswer();
	}

	get currentQuestion() {
		return this.request.questions[this.questionIndex];
	}

	get answerCount(): number {
		return this.answers.size;
	}

	get allAnswered(): boolean {
		return this.answers.size === this.request.questions.length;
	}

	getAnswer(questionId: string): QuestionAnswer | undefined {
		return this.answers.get(questionId);
	}

	getAnswers(): Record<string, QuestionAnswer> {
		return Object.fromEntries(this.answers);
	}

	moveOption(delta: number): void {
		const question = this.currentQuestion;
		if (!question || this.customInput) return;
		const count = question.options.length;
		this.optionIndex = (this.optionIndex + delta + count) % count;
		this.customError = undefined;
	}

	moveReview(delta: number): void {
		if (this.screen !== "review") return;
		const count = this.request.questions.length + 1;
		this.reviewIndex = (this.reviewIndex + delta + count) % count;
	}

	goBack(): void {
		this.customError = undefined;
		if (this.customInput) {
			this.customInput = false;
			return;
		}
		if (this.screen === "review") {
			this.questionIndex = this.request.questions.length - 1;
			this.screen = "question";
			this.syncOptionToAnswer();
			return;
		}
		if (this.questionIndex > 0) {
			this.questionIndex--;
			this.syncOptionToAnswer();
		}
	}

	goForward(): QuestionPickerTransition {
		if (this.screen !== "question" || this.customInput) return { type: "none" };
		if (!this.answers.has(this.currentQuestion.id)) return { type: "none" };
		return this.advanceQuestion();
	}

	confirm(): QuestionPickerTransition {
		this.customError = undefined;
		if (this.screen === "review") {
			if (this.reviewIndex < this.request.questions.length) {
				this.questionIndex = this.reviewIndex;
				this.screen = "question";
				this.syncOptionToAnswer();
				return { type: "edit", questionIndex: this.questionIndex };
			}
			return { type: "submitted", response: this.submittedResponse() };
		}

		const question = this.currentQuestion;
		const option = question.options[this.optionIndex];
		if (!option) return { type: "none" };
		if (option.id === QUESTION_CUSTOM_OPTION_ID) {
			this.customInput = true;
			return { type: "custom-input", value: this.getAnswer(question.id)?.customText ?? "" };
		}

		this.answers.set(question.id, { optionId: option.id, label: option.label });
		return this.advanceQuestion();
	}

	submitCustomText(value: string): QuestionPickerTransition {
		if (!this.customInput) return { type: "none" };
		const question = this.currentQuestion;
		const trimmed = value.trim();
		if (!trimmed) {
			this.customError = "Custom answers cannot be empty.";
			return { type: "invalid", message: this.customError };
		}

		this.answers.set(question.id, {
			optionId: QUESTION_CUSTOM_OPTION_ID,
			customText: value,
			label: question.options[this.optionIndex]?.label ?? "Write my own answer",
		});
		this.customInput = false;
		this.customError = undefined;
		return this.advanceQuestion();
	}

	private advanceQuestion(): QuestionPickerTransition {
		if (this.questionIndex < this.request.questions.length - 1) {
			this.questionIndex++;
			this.syncOptionToAnswer();
			return { type: "none" };
		}
		this.screen = "review";
		this.reviewIndex = 0;
		return { type: "review" };
	}

	private syncOptionToAnswer(): void {
		const question = this.currentQuestion;
		if (!question) return;
		const answer = this.answers.get(question.id);
		const index = answer ? question.options.findIndex((option) => option.id === answer.optionId) : -1;
		this.optionIndex = index >= 0 ? index : 0;
		this.customInput = false;
	}

	private submittedResponse(): AskUserResponse {
		return { status: "submitted", answers: this.getAnswers() };
	}
}
