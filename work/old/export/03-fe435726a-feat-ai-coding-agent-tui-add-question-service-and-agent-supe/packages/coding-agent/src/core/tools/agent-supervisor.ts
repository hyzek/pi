import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";
import type { AgentSupervisor } from "../agent-supervisor.ts";
import type { ToolDefinition } from "../extensions/types.ts";

const spawnAgentSchema = Type.Object({
	task: Type.String({ description: "Bounded task for the child agent" }),
	name: Type.String({
		description: "Give the child a distinct, short name of 1–5 letters for its chat tab (for example Scout or Code)",
		minLength: 1,
		maxLength: 5,
		pattern: "^[A-Za-z]{1,5}$",
	}),
	expectedOutput: Type.Optional(Type.String({ description: "What the child should return" })),
	contextBrief: Type.Optional(
		Type.String({ description: "Concise relevant context; do not copy the full conversation" }),
	),
	paths: Type.Optional(Type.Array(Type.String({ description: "Relevant workspace path" }))),
	model: Type.Optional(
		Type.Object({
			provider: Type.String(),
			modelId: Type.String(),
		}),
	),
	thinkingLevel: Type.Optional(Type.String()),
});

const waitAgentsSchema = Type.Object({
	ids: Type.Optional(Type.Array(Type.String())),
	timeoutMs: Type.Optional(Type.Number({ minimum: 0, maximum: 120000 })),
});

const sendAgentMessageSchema = Type.Object({
	id: Type.String(),
	message: Type.String(),
});

const stopAgentSchema = Type.Object({
	id: Type.String(),
});

type SpawnAgentInput = Static<typeof spawnAgentSchema>;
type WaitAgentsInput = Static<typeof waitAgentsSchema>;
type SendAgentMessageInput = Static<typeof sendAgentMessageSchema>;
type StopAgentInput = Static<typeof stopAgentSchema>;
const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);

function result(text: string): { content: [{ type: "text"; text: string }]; details: undefined } {
	return { content: [{ type: "text", text }], details: undefined };
}

export function createAgentSupervisorToolDefinitions(supervisor: AgentSupervisor): ToolDefinition[] {
	return [
		{
			name: "spawn_agent",
			label: "spawn_agent",
			description:
				"Start a bounded read-only child agent and return its ID immediately. The parent can finish its turn; Flux will resume it when the child completes.",
			promptSnippet: "Delegate a bounded read-only task to a child agent",
			promptGuidelines: [
				"Always give each child a distinct name of 1–5 letters; its task goes in task, not name.",
				"After spawning a child, finish the current turn instead of waiting synchronously; the parent will be resumed with the child result.",
			],
			parameters: spawnAgentSchema,
			execute: async (_toolCallId, input: SpawnAgentInput) => {
				const thinkingLevel = input.thinkingLevel;
				if (thinkingLevel !== undefined && !THINKING_LEVELS.has(thinkingLevel as ThinkingLevel)) {
					throw new Error(`Invalid child thinking level: ${thinkingLevel}`);
				}
				return result(
					supervisor.spawnAgent({
						...input,
						thinkingLevel: thinkingLevel as ThinkingLevel | undefined,
					}),
				);
			},
		},
		{
			name: "wait_agents",
			label: "wait_agents",
			description:
				"Wait for selected child agents and return compact status and bounded results. Prefer finishing the parent turn so Flux can resume automatically when a child completes.",
			promptSnippet: "Wait for delegated child results",
			parameters: waitAgentsSchema,
			execute: async (_toolCallId, input: WaitAgentsInput) =>
				result(JSON.stringify(await supervisor.waitAgents(input))),
		},
		{
			name: "send_agent_message",
			label: "send_agent_message",
			description: "Send a concise follow-up or clarification to a child agent.",
			promptSnippet: "Clarify or follow up with a child agent",
			parameters: sendAgentMessageSchema,
			execute: async (_toolCallId, input: SendAgentMessageInput) => {
				await supervisor.sendAgentMessage(input.id, input.message);
				return result("Message sent");
			},
		},
		{
			name: "stop_agent",
			label: "stop_agent",
			description: "Cancel a running or queued child agent.",
			promptSnippet: "Stop a delegated child agent",
			parameters: stopAgentSchema,
			execute: async (_toolCallId, input: StopAgentInput) =>
				result(JSON.stringify(await supervisor.stopAgent(input.id))),
		},
	];
}
