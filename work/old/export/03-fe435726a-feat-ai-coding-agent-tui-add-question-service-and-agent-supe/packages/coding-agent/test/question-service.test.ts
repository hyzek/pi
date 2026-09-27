import { describe, expect, it, vi } from "vitest";
import {
	type AskUserInput,
	type AskUserResponse,
	addCustomOptions,
	findUnfinishedQuestionRequests,
	QUESTION_CUSTOM_OPTION_ID,
	QUESTION_CUSTOM_OPTION_LABEL,
	QuestionService,
	QuestionValidationError,
	validateAskUserInput,
} from "../src/core/question-service.ts";
import { createAskUserToolDefinition } from "../src/core/tools/ask-user.ts";

const input: AskUserInput = {
	questions: [
		{
			id: "storage",
			header: "Storage",
			prompt: "Where should task history live?",
			options: [
				{ id: "sqlite", label: "Local SQLite", description: "Structured local persistence.", recommended: true },
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

function submittedResponse(): AskUserResponse {
	return {
		status: "submitted",
		answers: {
			storage: { optionId: "sqlite", label: "Local SQLite" },
			retention: {
				optionId: QUESTION_CUSTOM_OPTION_ID,
				customText: "Keep it until I delete it",
				label: QUESTION_CUSTOM_OPTION_LABEL,
			},
		},
	};
}

describe("QuestionService", () => {
	it("validates input and adds the mandatory custom choice", () => {
		const request = addCustomOptions(input);
		expect(request.questions).toHaveLength(2);
		expect(request.questions[1]?.options.at(-1)).toEqual({
			id: QUESTION_CUSTOM_OPTION_ID,
			label: QUESTION_CUSTOM_OPTION_LABEL,
			description: "Enter a custom answer.",
		});
		expect(() => validateAskUserInput({ ...input, questions: [input.questions[0]!, input.questions[0]!] })).toThrow(
			QuestionValidationError,
		);
	});

	it("submits a batch once and persists the request and response", async () => {
		const requests: unknown[] = [];
		const responses: unknown[] = [];
		const handler = vi.fn(() => submittedResponse());
		const service = new QuestionService({
			handler,
			onRequest: (request) => requests.push(request),
			onResponse: (request, response) => responses.push({ request, response }),
		});

		const result = await service.ask(input);
		expect(result).toEqual(submittedResponse());
		expect(handler).toHaveBeenCalledOnce();
		expect(requests).toHaveLength(1);
		expect(responses).toHaveLength(1);
		expect((requests[0] as { questions: AskUserInput["questions"] }).questions[1]?.options).toHaveLength(3);
	});

	it("returns unavailable without an interactive handler", async () => {
		const result = await new QuestionService().ask(input);
		expect(result.status).toBe("unavailable");
		if (result.status === "unavailable") expect(result.reason).toBe("no_handler");
	});

	it("cancels on abort and rejects stale or duplicate responses", async () => {
		let requestId = "";
		const service = new QuestionService({
			handler: () => new Promise<AskUserResponse>(() => {}),
			onRequest: (request) => {
				requestId = request.requestId;
			},
		});
		const controller = new AbortController();
		const pending = service.ask(input, controller.signal);
		await vi.waitFor(() => expect(requestId).not.toBe(""));

		expect(service.respond("question_stale", submittedResponse())).toBe(false);
		controller.abort();
		expect(await pending).toEqual({ status: "cancelled", reason: "aborted" });
		expect(service.respond(requestId, submittedResponse())).toBe(false);
	});

	it("turns malformed handler responses into unavailable", async () => {
		const result = await new QuestionService({
			handler: () => ({
				status: "submitted",
				answers: {
					storage: { optionId: "sqlite", label: "wrong label" },
					retention: { optionId: "short", label: "30 days" },
				},
			}),
		}).ask(input);
		expect(result.status).toBe("unavailable");
		if (result.status === "unavailable") expect(result.reason).toBe("invalid_response");
	});
});

describe("ask_user tool", () => {
	it("returns structured JSON and uses the session-owned service", async () => {
		const service = new QuestionService({ handler: () => ({ status: "cancelled", reason: "user" }) });
		const tool = createAskUserToolDefinition(service);
		const result = await tool.execute("call-1", input, undefined, undefined, {} as never);
		expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ status: "cancelled", reason: "user" }) }]);
	});
});

describe("question persistence recovery", () => {
	it("identifies requests without a response so hosts can mark them interrupted", () => {
		const request = { ...addCustomOptions(input), requestId: "question_1" };
		const unfinished = findUnfinishedQuestionRequests([
			{ type: "custom", customType: "ask_user_request", data: request, id: "1", parentId: null, timestamp: "now" },
		]);
		expect(unfinished).toEqual([request]);
		expect(
			findUnfinishedQuestionRequests([
				{
					type: "custom",
					customType: "ask_user_request",
					data: request,
					id: "1",
					parentId: null,
					timestamp: "now",
				},
				{
					type: "custom",
					customType: "ask_user_response",
					data: { requestId: "question_1", response: { status: "cancelled" } },
					id: "2",
					parentId: "1",
					timestamp: "now",
				},
			]),
		).toEqual([]);
	});
});
