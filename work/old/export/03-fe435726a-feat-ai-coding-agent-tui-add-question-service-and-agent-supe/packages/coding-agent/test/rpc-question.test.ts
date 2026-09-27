import { describe, expect, it, vi } from "vitest";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";
import type { RpcQuestionRequest } from "../src/modes/rpc/rpc-types.ts";

function request(): RpcQuestionRequest {
	return {
		type: "question_request",
		requestId: "question_1",
		questions: [
			{
				id: "choice",
				header: "Choice",
				prompt: "Pick one",
				options: [
					{ id: "one", label: "One", description: "First" },
					{ id: "two", label: "Two", description: "Second" },
				],
			},
		],
	};
}

function attachFakeProcess(client: RpcClient): { writes: string[] } {
	const writes: string[] = [];
	const fakeProcess = {
		stdin: {
			destroyed: false,
			writable: true,
			write: vi.fn((value: string) => {
				writes.push(value);
				return true;
			}),
		},
		exitCode: null,
		signalCode: null,
	};
	(client as unknown as { process: typeof fakeProcess }).process = fakeProcess;
	return { writes };
}

describe("RPC question protocol", () => {
	it("invokes the host callback and writes a correlated response", async () => {
		const client = new RpcClient({
			questionHandler: (received) => ({
				status: "submitted",
				answers: { choice: { optionId: "one", label: received.questions[0]!.options[0]!.label } },
			}),
		});
		const { writes } = attachFakeProcess(client);
		(client as unknown as { handleLine: (line: string) => void }).handleLine(JSON.stringify(request()));
		await vi.waitFor(() => expect(writes).toHaveLength(1));

		expect(JSON.parse(writes[0]!)).toEqual({
			type: "question_response",
			requestId: "question_1",
			response: {
				status: "submitted",
				answers: { choice: { optionId: "one", label: "One" } },
			},
		});
	});

	it("responds unavailable when a request arrives without a handler", async () => {
		const client = new RpcClient();
		const { writes } = attachFakeProcess(client);
		(client as unknown as { handleLine: (line: string) => void }).handleLine(JSON.stringify(request()));
		await vi.waitFor(() => expect(writes).toHaveLength(1));

		expect(JSON.parse(writes[0]!)).toMatchObject({
			type: "question_response",
			requestId: "question_1",
			response: { status: "unavailable", reason: "no_handler" },
		});
	});
});
