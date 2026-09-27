import type { SessionEntry } from "./session-manager.ts";

export const QUESTION_CUSTOM_OPTION_ID = "__custom__";
export const QUESTION_CUSTOM_OPTION_LABEL = "Write my own answer";

export const QUESTION_LIMITS = {
	maxQuestions: 5,
	minOptions: 2,
	maxOptions: 3,
	maxIdLength: 64,
	maxHeaderLength: 80,
	maxPromptLength: 1000,
	maxOptionLabelLength: 120,
	maxOptionDescriptionLength: 300,
	maxCustomAnswerLength: 4000,
} as const;

export interface QuestionOption {
	id: string;
	label: string;
	description: string;
	recommended?: boolean;
}

export interface Question {
	id: string;
	header: string;
	prompt: string;
	options: QuestionOption[];
}

export interface AskUserInput {
	questions: Question[];
}

export interface QuestionRequest extends AskUserInput {
	requestId: string;
}

export interface QuestionAnswer {
	optionId?: string;
	customText?: string;
	/** The exact visible label for the selected choice. */
	label: string;
}

export type AskUserResponse =
	| { status: "submitted"; answers: Record<string, QuestionAnswer> }
	| { status: "cancelled"; reason?: "user" | "aborted" | "interrupted" }
	| {
			status: "unavailable";
			reason: "no_handler" | "handler_error" | "invalid_response";
			message: string;
	  };

export type QuestionHandler = (
	request: QuestionRequest,
	signal: AbortSignal,
) => AskUserResponse | Promise<AskUserResponse>;

export interface QuestionServiceOptions {
	handler?: QuestionHandler;
	onRequest?: (request: QuestionRequest) => void;
	onResponse?: (request: QuestionRequest, response: AskUserResponse) => void;
}

interface PendingQuestion {
	request: QuestionRequest;
	controller: AbortController;
	resolve: (response: AskUserResponse) => void;
	signal?: AbortSignal;
}

export class QuestionValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "QuestionValidationError";
	}
}

export function validateAskUserInput(input: AskUserInput): void {
	if (!input || !Array.isArray(input.questions)) {
		throw new QuestionValidationError("questions must be an array");
	}
	if (input.questions.length < 1 || input.questions.length > QUESTION_LIMITS.maxQuestions) {
		throw new QuestionValidationError(`questions must contain 1-${QUESTION_LIMITS.maxQuestions} items`);
	}

	const questionIds = new Set<string>();
	for (const question of input.questions) {
		validateText(question?.id, "question id", QUESTION_LIMITS.maxIdLength);
		if (questionIds.has(question.id)) throw new QuestionValidationError(`Duplicate question id: ${question.id}`);
		questionIds.add(question.id);
		validateText(question.header, `header for ${question.id}`, QUESTION_LIMITS.maxHeaderLength);
		validateText(question.prompt, `prompt for ${question.id}`, QUESTION_LIMITS.maxPromptLength);
		if (!Array.isArray(question.options)) {
			throw new QuestionValidationError(`options for ${question.id} must be an array`);
		}
		if (
			question.options.length < QUESTION_LIMITS.minOptions ||
			question.options.length > QUESTION_LIMITS.maxOptions
		) {
			throw new QuestionValidationError(
				`options for ${question.id} must contain ${QUESTION_LIMITS.minOptions}-${QUESTION_LIMITS.maxOptions} items`,
			);
		}

		const optionIds = new Set<string>();
		let recommendedCount = 0;
		for (const option of question.options) {
			validateText(option?.id, `option id for ${question.id}`, QUESTION_LIMITS.maxIdLength);
			if (option.id === QUESTION_CUSTOM_OPTION_ID)
				throw new QuestionValidationError(`Option id ${QUESTION_CUSTOM_OPTION_ID} is reserved`);
			if (optionIds.has(option.id)) throw new QuestionValidationError(`Duplicate option id: ${option.id}`);
			optionIds.add(option.id);
			validateText(option.label, `option label for ${question.id}`, QUESTION_LIMITS.maxOptionLabelLength);
			validateText(
				option.description,
				`option description for ${question.id}`,
				QUESTION_LIMITS.maxOptionDescriptionLength,
			);
			if (option.recommended) recommendedCount++;
		}
		if (recommendedCount > 1) {
			throw new QuestionValidationError(`Question ${question.id} has more than one recommended option`);
		}
	}
}

export function addCustomOptions(input: AskUserInput): QuestionRequest {
	validateAskUserInput(input);
	return {
		requestId: "",
		questions: input.questions.map((question) => ({
			...question,
			options: [
				...question.options,
				{
					id: QUESTION_CUSTOM_OPTION_ID,
					label: QUESTION_CUSTOM_OPTION_LABEL,
					description: "Enter a custom answer.",
				},
			],
		})),
	};
}

export function validateAskUserResponse(request: QuestionRequest, response: AskUserResponse): void {
	if (!response || typeof response !== "object" || !("status" in response)) {
		throw new QuestionValidationError("Question response must be an object with a status");
	}
	if (response.status !== "submitted" && response.status !== "cancelled" && response.status !== "unavailable") {
		throw new QuestionValidationError("Question response has an invalid status");
	}
	if (response.status !== "submitted") return;
	const questionIds = new Set(request.questions.map((question) => question.id));
	const answerIds = Object.keys(response.answers);
	if (answerIds.length !== questionIds.size || answerIds.some((id) => !questionIds.has(id))) {
		throw new QuestionValidationError("Submitted answers must contain exactly one answer for each question");
	}

	for (const question of request.questions) {
		const answer = response.answers[question.id];
		if (!answer || typeof answer.label !== "string" || answer.label.trim() === "") {
			throw new QuestionValidationError(`Answer for ${question.id} must include a visible label`);
		}
		const option = question.options.find((candidate) => candidate.id === answer.optionId);
		if (answer.optionId === QUESTION_CUSTOM_OPTION_ID) {
			if (answer.label !== QUESTION_CUSTOM_OPTION_LABEL)
				throw new QuestionValidationError(`Custom answer for ${question.id} has an invalid label`);
			if (typeof answer.customText !== "string" || answer.customText.trim() === "")
				throw new QuestionValidationError(`Custom answer for ${question.id} cannot be empty`);
			if (answer.customText.length > QUESTION_LIMITS.maxCustomAnswerLength)
				throw new QuestionValidationError(`Custom answer for ${question.id} is too long`);
		} else if (!option || answer.customText !== undefined || answer.label !== option.label) {
			throw new QuestionValidationError(`Answer for ${question.id} does not match a visible option`);
		}
	}
}

export function findUnfinishedQuestionRequests(entries: readonly SessionEntry[]): QuestionRequest[] {
	const requests = new Map<string, QuestionRequest>();
	const completed = new Set<string>();
	for (const entry of entries) {
		if (entry.type !== "custom") continue;
		if (entry.customType === "ask_user_request" && isQuestionRequest(entry.data))
			requests.set(entry.data.requestId, entry.data);
		if (entry.customType === "ask_user_response" && isPersistedQuestionResponse(entry.data))
			completed.add(entry.data.requestId);
	}
	return [...requests].filter(([requestId]) => !completed.has(requestId)).map(([, request]) => request);
}

export class QuestionService {
	private handler: QuestionHandler | undefined;
	private readonly onRequest: QuestionServiceOptions["onRequest"];
	private readonly onResponse: QuestionServiceOptions["onResponse"];
	private readonly queue: PendingQuestion[] = [];
	private active: PendingQuestion | undefined;
	private nextRequestId = 0;

	constructor(options: QuestionServiceOptions = {}) {
		this.handler = options.handler;
		this.onRequest = options.onRequest;
		this.onResponse = options.onResponse;
	}

	setHandler(handler: QuestionHandler | undefined): void {
		this.handler = handler;
		if (!handler) this.cancelAll("unavailable");
		this.pump();
	}

	ask(input: AskUserInput, signal?: AbortSignal): Promise<AskUserResponse> {
		const request = addCustomOptions(input);
		if (!this.handler)
			return Promise.resolve(
				unavailableResponse("no_handler", "Interactive questions are unavailable; ask the user in text."),
			);
		if (signal?.aborted) return Promise.resolve({ status: "cancelled", reason: "aborted" });

		request.requestId = `question_${++this.nextRequestId}`;
		return new Promise((resolve) => {
			const pending: PendingQuestion = { request, controller: new AbortController(), resolve, signal };
			this.queue.push(pending);
			this.onRequest?.(request);
			if (signal) signal.addEventListener("abort", () => this.cancel(pending), { once: true });
			this.pump();
		});
	}

	/** Resolve a request delivered to a remote UI. Returns false for stale/duplicate IDs. */
	respond(requestId: string, response: AskUserResponse): boolean {
		const pending = this.active;
		if (!pending || pending.request.requestId !== requestId) return false;
		this.finish(pending, response);
		return true;
	}

	cancelAll(reason: "aborted" | "interrupted" | "unavailable" = "aborted"): void {
		for (const pending of [...this.queue, ...(this.active ? [this.active] : [])]) {
			if (reason === "unavailable")
				this.finish(pending, unavailableResponse("no_handler", "Interactive questions are unavailable."));
			else this.finish(pending, { status: "cancelled", reason });
		}
	}

	private cancel(pending: PendingQuestion): void {
		if (this.active !== pending && !this.queue.includes(pending)) return;
		this.finish(pending, { status: "cancelled", reason: "aborted" });
	}

	private pump(): void {
		if (this.active || this.queue.length === 0) return;
		const pending = this.queue.shift();
		if (!pending) return;
		this.active = pending;
		const handler = this.handler;
		if (!handler) {
			this.finish(
				pending,
				unavailableResponse("no_handler", "Interactive questions are unavailable; ask the user in text."),
			);
			return;
		}
		void Promise.resolve()
			.then(() => handler(pending.request, pending.controller.signal))
			.then(
				(response) => this.finish(pending, response),
				(error: unknown) =>
					this.finish(
						pending,
						unavailableResponse("handler_error", error instanceof Error ? error.message : String(error)),
					),
			);
	}

	private finish(pending: PendingQuestion, response: AskUserResponse): void {
		const isActive = this.active === pending;
		const queuedIndex = this.queue.indexOf(pending);
		if (!isActive && queuedIndex === -1) return;
		if (queuedIndex !== -1) this.queue.splice(queuedIndex, 1);
		if (isActive) {
			this.active = undefined;
			pending.controller.abort();
		}

		let finalResponse = response;
		try {
			validateAskUserResponse(pending.request, response);
		} catch (error: unknown) {
			finalResponse = unavailableResponse(
				"invalid_response",
				error instanceof Error ? error.message : String(error),
			);
		}
		this.onResponse?.(pending.request, finalResponse);
		pending.resolve(finalResponse);
		if (isActive) this.pump();
	}
}

function validateText(value: unknown, label: string, maxLength: number): asserts value is string {
	if (typeof value !== "string" || value.trim() === "") throw new QuestionValidationError(`${label} cannot be empty`);
	if (value.length > maxLength) throw new QuestionValidationError(`${label} is too long`);
}

function unavailableResponse(
	reason: "no_handler" | "handler_error" | "invalid_response",
	message: string,
): AskUserResponse {
	return { status: "unavailable", reason, message };
}

function isQuestionRequest(value: unknown): value is QuestionRequest {
	if (!value || typeof value !== "object") return false;
	const request = value as Partial<QuestionRequest>;
	if (typeof request.requestId !== "string" || !Array.isArray(request.questions)) return false;
	try {
		validateAskUserInput({
			questions: request.questions.map((question) => ({
				...question,
				options: question.options.filter((option) => option.id !== QUESTION_CUSTOM_OPTION_ID),
			})),
		});
		if (
			request.questions.some(
				(question) =>
					question.options.filter((option) => option.id === QUESTION_CUSTOM_OPTION_ID).length !== 1 ||
					question.options.find((option) => option.id === QUESTION_CUSTOM_OPTION_ID)?.label !==
						QUESTION_CUSTOM_OPTION_LABEL,
			)
		) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

function isPersistedQuestionResponse(value: unknown): value is { requestId: string; response: AskUserResponse } {
	if (!value || typeof value !== "object") return false;
	const persisted = value as { requestId?: unknown; response?: AskUserResponse };
	return typeof persisted.requestId === "string" && persisted.response !== undefined;
}
