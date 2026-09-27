/**
 * Core modules shared between all run modes.
 */

export {
	AgentSession,
	type AgentSessionConfig,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type ModelCycleResult,
	type PromptOptions,
	type SessionStats,
} from "./agent-session.ts";
export {
	AgentSessionRuntime,
	type CreateAgentSessionRuntimeFactory,
	type CreateAgentSessionRuntimeResult,
	createAgentSessionRuntime,
} from "./agent-session-runtime.ts";
export {
	type AgentSessionRuntimeDiagnostic,
	type AgentSessionServices,
	type CreateAgentSessionFromServicesOptions,
	type CreateAgentSessionServicesOptions,
	createAgentSessionFromServices,
	createAgentSessionServices,
} from "./agent-session-services.ts";
export {
	AGENT_CHILD_CONCURRENCY_LIMIT,
	AGENT_CHILD_ENTRY_TYPE,
	AGENT_CHILD_RESULT_LIMIT,
	type AgentChildMetadata,
	type AgentChildRequest,
	type AgentChildResult,
	type AgentChildSnapshot,
	type AgentChildStatus,
	type AgentModelReference,
	AgentSupervisor,
	AgentSupervisorError,
	type AgentSupervisorEvent,
	type AgentSupervisorEventListener,
	type AgentSupervisorOptions,
	type CreateChildSession,
	type CreateChildSessionContext,
	READ_ONLY_CHILD_TOOLS,
	type WaitAgentsOptions,
} from "./agent-supervisor.ts";
export { type BashExecutorOptions, type BashResult, executeBashWithOperations } from "./bash-executor.ts";
export type { CompactionResult } from "./compaction/index.ts";
export { createEventBus, type EventBus, type EventBusController } from "./event-bus.ts";
export { areExperimentalFeaturesEnabled } from "./experimental.ts";
// Extensions system
export {
	type AgentEndEvent,
	type AgentSettledEvent,
	type AgentStartEvent,
	type AgentToolResult,
	type AgentToolUpdateCallback,
	type BeforeAgentStartEvent,
	type BeforeAgentStartEventResult,
	type BuildSystemPromptOptions,
	type ContextEvent,
	defineTool,
	discoverAndLoadExtensions,
	type ExecOptions,
	type ExecResult,
	type Extension,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ExtensionError,
	type ExtensionEvent,
	type ExtensionFactory,
	type ExtensionFlag,
	type ExtensionHandler,
	ExtensionRunner,
	type ExtensionShortcut,
	type ExtensionUIContext,
	type InlineExtension,
	type LoadExtensionsResult,
	type MessageRenderer,
	type RegisteredCommand,
	type SessionBeforeCompactEvent,
	type SessionBeforeForkEvent,
	type SessionBeforeSwitchEvent,
	type SessionBeforeTreeEvent,
	type SessionCompactEvent,
	type SessionShutdownEvent,
	type SessionStartEvent,
	type SessionTreeEvent,
	type ToolCallEvent,
	type ToolCallEventResult,
	type ToolDefinition,
	type ToolRenderResultOptions,
	type ToolResultEvent,
	type TurnEndEvent,
	type TurnStartEvent,
	type WorkingIndicatorOptions,
} from "./extensions/index.ts";
export {
	classifyToolCall,
	formatToolCallForApproval,
	isPlanModeToolAllowed,
	type PermissionMode,
	PLAN_MODE_SYSTEM_PROMPT,
	PLAN_MODE_TOOL_NAMES,
	type ToolCallApprovalHandler,
	type ToolCallApprovalRequest,
	type ToolRisk,
} from "./permission-mode.ts";
export {
	type QuestionPickerScreen,
	QuestionPickerState,
	type QuestionPickerTransition,
} from "./question-picker-state.ts";
export {
	type AskUserInput,
	type AskUserResponse,
	addCustomOptions,
	findUnfinishedQuestionRequests,
	QUESTION_CUSTOM_OPTION_ID,
	QUESTION_CUSTOM_OPTION_LABEL,
	type Question,
	type QuestionAnswer,
	type QuestionHandler,
	type QuestionOption,
	type QuestionRequest,
	QuestionService,
	QuestionValidationError,
	validateAskUserInput,
	validateAskUserResponse,
} from "./question-service.ts";
export { createSyntheticSourceInfo } from "./source-info.ts";
