import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import type { ExtensionContext, ToolDefinition } from "../extensions/types.ts";
import { type AskUserInput, QuestionService } from "../question-service.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const questionOptionSchema = Type.Object({
	id: Type.String({ description: "Stable option identifier" }),
	label: Type.String({ description: "Short visible option label" }),
	description: Type.String({ description: "One-sentence tradeoff or explanation" }),
	recommended: Type.Optional(Type.Boolean({ description: "Whether this option is recommended" })),
});

const askUserSchema = Type.Object({
	questions: Type.Array(
		Type.Object({
			id: Type.String({ description: "Stable question identifier" }),
			header: Type.String({ description: "Short question header" }),
			prompt: Type.String({ description: "Question shown to the user" }),
			options: Type.Array(questionOptionSchema, { description: "Two or three choices" }),
		}),
		{ description: "One to five questions" },
	),
});

export type AskUserToolInput = Static<typeof askUserSchema>;

export const askUserToolSystemPromptContribution = {
	snippet: "Ask the user a small batch of structured preference questions",
	guidelines: [
		"Use ask_user only for consequential ambiguity or meaningful user preferences after inspecting available facts.",
		"Do not ask the user to locate facts in the repository or reconfirm explicit instructions.",
	],
} as const;

export function createAskUserToolDefinition(
	questionService: QuestionService = new QuestionService(),
): ToolDefinition<typeof askUserSchema> {
	return {
		name: "ask_user",
		label: "ask_user",
		description:
			"Ask the user one to five structured questions. Each question must have two or three options; a custom answer is added automatically.",
		promptSnippet: askUserToolSystemPromptContribution.snippet,
		promptGuidelines: [...askUserToolSystemPromptContribution.guidelines],
		parameters: askUserSchema,
		executionMode: "sequential",
		async execute(
			_toolCallId,
			params: AskUserToolInput,
			signal: AbortSignal | undefined,
			_onUpdate,
			_ctx: ExtensionContext,
		) {
			const response = await questionService.ask(params as AskUserInput, signal);
			const content: TextContent[] = [{ type: "text", text: JSON.stringify(response) }];
			return { content, details: undefined };
		},
	};
}

export function createAskUserTool(questionService?: QuestionService): AgentTool<typeof askUserSchema> {
	return wrapToolDefinition(createAskUserToolDefinition(questionService));
}
