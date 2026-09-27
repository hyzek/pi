import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { contentText, type Model, type Usage } from "@earendil-works/pi-ai";
import { getAgentDir } from "../config.ts";
import { AgentSession } from "./agent-session.ts";
import { estimateTokens } from "./compaction/index.ts";
import { type CreateAgentSessionResult, createAgentSession } from "./sdk.ts";
import { getDefaultSessionDir, SessionManager } from "./session-manager.ts";
import { addUsageToTotals, createUsageTotals, type UsageTotals } from "./usage-totals.ts";

export const AGENT_CHILD_ENTRY_TYPE = "agent_child";
export const AGENT_CHILD_RESULT_LIMIT = 8000;
export const AGENT_CHILD_CONCURRENCY_LIMIT = 2;
export const AGENT_CHILD_LIMIT = 5;
export const READ_ONLY_CHILD_TOOLS = ["read", "grep", "find", "ls"] as const;
const VALID_THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);

export type AgentChildStatus =
	| "queued"
	| "running"
	| "waiting_for_approval"
	| "completed"
	| "failed"
	| "cancelled"
	| "interrupted";

export interface AgentModelReference {
	provider: string;
	modelId: string;
}

export interface AgentChildRequest {
	task: string;
	name: string;
	expectedOutput?: string;
	contextBrief?: string;
	paths?: string[];
	model?: AgentModelReference;
	thinkingLevel?: ThinkingLevel;
}

export interface AgentChildResult {
	text: string;
	stopReason?: string;
	truncated: boolean;
}

export interface AgentChildMetadata {
	id: string;
	parentId: string;
	task: string;
	title: string;
	contextBrief?: string;
	expectedOutput?: string;
	paths?: string[];
	workspace: string;
	model: AgentModelReference;
	thinkingLevel: ThinkingLevel;
	status: AgentChildStatus;
	createdAt: string;
	updatedAt: string;
	usage: UsageTotals;
	transcriptReference?: string;
	result?: AgentChildResult;
	error?: string;
}

export interface AgentChildSnapshot extends AgentChildMetadata {
	queuedMessages: number;
	activity?: string;
	usageEstimated?: boolean;
}

export type AgentSupervisorEvent = {
	type: "agent_update";
	snapshot: AgentChildSnapshot;
};

export type AgentSupervisorEventListener = (event: AgentSupervisorEvent) => void;

export interface CreateChildSessionContext {
	childId: string;
	request: AgentChildRequest;
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	cwd: string;
	parentSession: AgentSession;
	signal: AbortSignal;
	childTools: readonly string[];
}

export type CreateChildSession = (
	context: CreateChildSessionContext,
) => Promise<CreateAgentSessionResult | AgentSession>;

export interface AgentSupervisorOptions {
	parentSession: AgentSession;
	createChildSession?: CreateChildSession;
	maxConcurrency?: number;
	maxResultChars?: number;
	parentSignal?: AbortSignal;
	projectInstructions?: string;
	modelResolver?: (reference: AgentModelReference) => Model<any> | undefined;
	/** Resume the parent with completed child results after its current turn settles. */
	resumeParentOnChildCompletion?: boolean;
}

export interface WaitAgentsOptions {
	ids?: string[];
	timeoutMs?: number;
}

export class AgentSupervisorError extends Error {}

type ChildRecord = {
	metadata: AgentChildMetadata;
	session?: AgentSession;
	unsubscribeSession?: () => void;
	activity?: string;
	provisionalOutputTokens: number;
	controller: AbortController;
	promise?: Promise<void>;
	completion: Promise<void>;
	resolveCompletion: () => void;
	queuedMessages: string[];
};

function boundedText(text: string, limit: number): AgentChildResult {
	return {
		text: text.slice(0, limit),
		stopReason: undefined,
		truncated: text.length > limit,
	};
}

function isTerminal(status: AgentChildStatus): boolean {
	return status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted";
}

function assertNonEmpty(value: string | undefined, field: string, maxLength: number): string {
	if (!value || value.trim().length === 0) throw new AgentSupervisorError(`${field} must not be empty`);
	if (value.length > maxLength) throw new AgentSupervisorError(`${field} must be ${maxLength} characters or fewer`);
	return value.trim();
}

function summarizeActivity(prefix: string, detail?: string): string {
	const text = detail
		?.replace(/[\r\n\t]+/gu, " ")
		.replace(/ +/gu, " ")
		.trim();
	return text ? `${prefix}: ${text.slice(-96)}` : prefix;
}

function readUsage(session: AgentSession): UsageTotals {
	const totals = createUsageTotals();
	for (const message of session.messages) {
		if ((message.role === "assistant" || message.role === "toolResult") && message.usage) {
			addUsageToTotals(totals, message.usage as Usage);
		}
	}
	return totals;
}

function getLastAssistant(
	session: AgentSession,
): { text: string; stopReason?: string; errorMessage?: string } | undefined {
	for (let index = session.messages.length - 1; index >= 0; index--) {
		const message = session.messages[index];
		if (message?.role === "assistant") {
			return {
				text: contentText(message.content, ""),
				stopReason: message.stopReason,
				errorMessage: message.errorMessage,
			};
		}
	}
	return undefined;
}

function childPrompt(request: AgentChildRequest, cwd: string, projectInstructions?: string): string {
	const sections = [`You are a read-only child agent working in ${cwd}.`, `Task:\n${request.task}`];
	if (request.contextBrief) sections.push(`Context brief:\n${request.contextBrief}`);
	if (request.expectedOutput) sections.push(`Expected output:\n${request.expectedOutput}`);
	if (request.paths && request.paths.length > 0) sections.push(`Relevant paths:\n${request.paths.join("\n")}`);
	if (projectInstructions) sections.push(`Project instructions:\n${projectInstructions}`);
	sections.push(
		"Use only read, grep, find, and ls. Do not edit files, run shell commands, delegate, or open a user interface.",
	);
	return sections.join("\n\n");
}

export class AgentSupervisor {
	readonly parentSession: AgentSession;
	private readonly records = new Map<string, ChildRecord>();
	private readonly queue: string[] = [];
	private readonly maxConcurrency: number;
	private readonly maxResultChars: number;
	private readonly createChild: CreateChildSession;
	private readonly projectInstructions?: string;
	private readonly modelResolver?: (reference: AgentModelReference) => Model<any> | undefined;
	private readonly listeners = new Set<AgentSupervisorEventListener>();
	private readonly resumeParentOnChildCompletion: boolean;
	private readonly pendingParentResumes = new Set<string>();
	private parentResumeTimer: ReturnType<typeof setTimeout> | undefined;
	private running = 0;
	private disposed = false;
	private readonly unsubscribeParent: () => void;

	constructor(options: AgentSupervisorOptions) {
		this.parentSession = options.parentSession;
		this.maxConcurrency = Math.max(
			1,
			Math.min(AGENT_CHILD_CONCURRENCY_LIMIT, Math.floor(options.maxConcurrency ?? AGENT_CHILD_CONCURRENCY_LIMIT)),
		);
		this.maxResultChars = Math.max(1, Math.floor(options.maxResultChars ?? AGENT_CHILD_RESULT_LIMIT));
		this.projectInstructions = options.projectInstructions;
		this.modelResolver = options.modelResolver;
		this.resumeParentOnChildCompletion = options.resumeParentOnChildCompletion ?? false;
		this.createChild = options.createChildSession ?? ((context) => this.createDefaultChildSession(context));
		this.restore();
		this.parentSession.attachAgentSupervisor(this);
		this.unsubscribeParent = this.parentSession.subscribe((event) => {
			if (
				event.type === "agent_end" &&
				event.messages.some((message) => message.role === "assistant" && message.stopReason === "aborted")
			) {
				void this.stopAll("interrupted");
			}
			if (event.type === "agent_settled") void this.flushParentResume();
		});
		if (options.parentSignal) {
			if (options.parentSignal.aborted) void this.stopAll("interrupted");
			else options.parentSignal.addEventListener("abort", () => void this.stopAll("interrupted"), { once: true });
		}
	}

	private restore(): void {
		const latest = new Map<string, AgentChildMetadata>();
		for (const entry of this.parentSession.sessionManager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== AGENT_CHILD_ENTRY_TYPE || !entry.data) continue;
			const metadata = entry.data as AgentChildMetadata;
			if (typeof metadata.id === "string" && typeof metadata.parentId === "string")
				latest.set(metadata.id, metadata);
		}
		for (const metadata of latest.values()) {
			if (metadata.parentId !== this.parentSession.sessionId) continue;
			const restored = isTerminal(metadata.status)
				? metadata
				: { ...metadata, status: "interrupted" as const, updatedAt: new Date().toISOString() };
			const completion = Promise.resolve();
			this.records.set(metadata.id, {
				metadata: restored,
				controller: new AbortController(),
				completion,
				resolveCompletion: () => undefined,
				queuedMessages: [],
				provisionalOutputTokens: 0,
			});
			if (restored.status === "interrupted" && metadata.status !== "interrupted") this.persist(restored);
		}
	}

	private persist(metadata: AgentChildMetadata): void {
		this.parentSession.sessionManager.appendCustomEntry(AGENT_CHILD_ENTRY_TYPE, metadata);
	}

	subscribe(listener: AgentSupervisorEventListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emitUpdate(record: ChildRecord): void {
		const snapshot = this.getSnapshot(record);
		for (const listener of this.listeners) listener({ type: "agent_update", snapshot });
	}

	private getSnapshot(record: ChildRecord): AgentChildSnapshot {
		return {
			...record.metadata,
			usage: {
				...record.metadata.usage,
				output: record.metadata.usage.output + record.provisionalOutputTokens,
			},
			queuedMessages: record.queuedMessages.length,
			...(record.provisionalOutputTokens > 0 ? { usageEstimated: true } : {}),
			...(record.activity ? { activity: record.activity } : {}),
		};
	}

	private resolveModel(reference?: AgentModelReference): { model: Model<any>; reference: AgentModelReference } {
		const parentModel = this.parentSession.model;
		if (!parentModel) throw new AgentSupervisorError("Cannot spawn an agent before the parent selects a model");
		const effectiveReference = reference ?? { provider: parentModel.provider, modelId: parentModel.id };
		if (!effectiveReference.provider || !effectiveReference.modelId)
			throw new AgentSupervisorError("Child model requires provider and modelId");
		const model = reference
			? (this.modelResolver?.(effectiveReference) ??
				this.parentSession.modelRuntime.getModel(effectiveReference.provider, effectiveReference.modelId))
			: parentModel;
		if (!model || model.provider !== effectiveReference.provider || model.id !== effectiveReference.modelId) {
			throw new AgentSupervisorError(
				`Unknown child model ${effectiveReference.provider}/${effectiveReference.modelId}`,
			);
		}
		return { model, reference: effectiveReference };
	}

	spawnAgent(request: AgentChildRequest): string {
		if (this.disposed) throw new AgentSupervisorError("Agent supervisor is stopped");
		if (this.records.size >= AGENT_CHILD_LIMIT)
			throw new AgentSupervisorError(`A session can have at most ${AGENT_CHILD_LIMIT} child agents`);
		const task = assertNonEmpty(request.task, "task", 4000);
		const title = assertNonEmpty(request.name, "name", 5);
		if (!/^[A-Za-z]{1,5}$/u.test(title)) throw new AgentSupervisorError("name must contain only 1–5 letters");
		if ([...this.records.values()].some((record) => record.metadata.title.toLowerCase() === title.toLowerCase()))
			throw new AgentSupervisorError(`Child agent name ${title} is already in use`);
		if (request.contextBrief && request.contextBrief.length > 4000)
			throw new AgentSupervisorError("contextBrief must be 4000 characters or fewer");
		if (request.expectedOutput && request.expectedOutput.length > 1000)
			throw new AgentSupervisorError("expectedOutput must be 1000 characters or fewer");
		if (request.paths && request.paths.length > 32)
			throw new AgentSupervisorError("paths must contain 32 entries or fewer");
		if (request.thinkingLevel !== undefined && !VALID_THINKING_LEVELS.has(request.thinkingLevel)) {
			throw new AgentSupervisorError(`Invalid child thinking level: ${request.thinkingLevel}`);
		}
		const { reference } = this.resolveModel(request.model);
		const id = `agent-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
		let resolveCompletion!: () => void;
		const completion = new Promise<void>((resolve) => {
			resolveCompletion = resolve;
		});
		const now = new Date().toISOString();
		const metadata: AgentChildMetadata = {
			id,
			parentId: this.parentSession.sessionId,
			task,
			title,
			...(request.contextBrief ? { contextBrief: request.contextBrief } : {}),
			...(request.expectedOutput ? { expectedOutput: request.expectedOutput } : {}),
			...(request.paths ? { paths: [...request.paths] } : {}),
			workspace: this.parentSession.sessionManager.getCwd(),
			model: reference,
			thinkingLevel: request.thinkingLevel ?? this.parentSession.thinkingLevel,
			status: "queued",
			createdAt: now,
			updatedAt: now,
			usage: createUsageTotals(),
		};
		const record: ChildRecord = {
			metadata,
			controller: new AbortController(),
			completion,
			resolveCompletion,
			queuedMessages: [],
			provisionalOutputTokens: 0,
		};
		this.records.set(id, record);
		this.queue.push(id);
		this.persist(metadata);
		this.emitUpdate(record);
		this.dispatch();
		return id;
	}

	private dispatch(): void {
		while (!this.disposed && this.running < this.maxConcurrency && this.queue.length > 0) {
			const id = this.queue.shift();
			if (!id) continue;
			const record = this.records.get(id);
			if (!record || record.metadata.status !== "queued") continue;
			this.running++;
			record.promise = this.run(record).finally(() => {
				this.running--;
				record.resolveCompletion();
				this.dispatch();
			});
		}
	}

	private async run(record: ChildRecord): Promise<void> {
		const { metadata } = record;
		const request: AgentChildRequest = {
			task: metadata.task,
			name: metadata.title,
			contextBrief: metadata.contextBrief,
			expectedOutput: metadata.expectedOutput,
			paths: metadata.paths,
			thinkingLevel: metadata.thinkingLevel,
		};
		this.updateStatus(record, "running");
		try {
			const model = this.resolveModel(metadata.model).model;
			const created = await this.createChild({
				childId: metadata.id,
				request,
				model,
				thinkingLevel: metadata.thinkingLevel,
				cwd: metadata.workspace,
				parentSession: this.parentSession,
				signal: record.controller.signal,
				childTools: this.getChildTools(),
			});
			record.session = created instanceof AgentSession ? created : created.session;
			record.unsubscribeSession = record.session.subscribe((event) => {
				if (event.type === "tool_execution_start") {
					record.activity = `Running ${event.toolName}`;
					this.refreshUsage(record);
				} else if (event.type === "tool_execution_end") {
					record.activity = "Reviewing tool result";
					this.refreshUsage(record);
				} else if (event.type === "message_update") {
					record.provisionalOutputTokens =
						event.message.role === "assistant"
							? Math.max(0, estimateTokens(event.message) - event.message.usage.output)
							: 0;
					record.activity =
						event.assistantMessageEvent.type === "thinking_delta"
							? summarizeActivity("Thinking", event.assistantMessageEvent.delta)
							: event.assistantMessageEvent.type === "toolcall_start" ||
									event.assistantMessageEvent.type === "toolcall_delta"
								? "Planning next tool"
								: event.assistantMessageEvent.type === "text_delta"
									? summarizeActivity("Writing", event.assistantMessageEvent.delta)
									: "Writing response";
					this.refreshUsage(record);
				} else if (event.type === "message_end") {
					record.provisionalOutputTokens = 0;
					record.activity = "Waiting for next step";
					this.refreshUsage(record);
				}
			});
			metadata.transcriptReference = record.session.sessionFile;
			if (record.controller.signal.aborted) {
				await record.session.abort();
				this.updateStatus(record, "cancelled");
				return;
			}
			await record.session.prompt(childPrompt(request, metadata.workspace, this.projectInstructions), {
				expandPromptTemplates: false,
				source: "rpc",
			});
			for (const message of record.queuedMessages.splice(0)) {
				await record.session.prompt(message, { expandPromptTemplates: false, source: "rpc" });
			}
			metadata.usage = readUsage(record.session);
			const assistant = getLastAssistant(record.session);
			if (record.controller.signal.aborted || assistant?.stopReason === "aborted") {
				this.updateStatus(record, "cancelled");
			} else if (!assistant || assistant.stopReason === "error") {
				metadata.error =
					assistant?.errorMessage || assistant?.text || "Child agent did not return a successful result";
				this.updateStatus(record, "failed");
			} else {
				metadata.result = { ...boundedText(assistant.text, this.maxResultChars), stopReason: assistant.stopReason };
				this.updateStatus(record, "completed");
			}
		} catch (error) {
			metadata.error = error instanceof Error ? error.message : String(error);
			this.updateStatus(record, record.controller.signal.aborted ? "cancelled" : "failed");
		}
	}

	private getChildTools(): readonly string[] {
		const parentTools = new Set(this.parentSession.getActiveToolNames());
		return READ_ONLY_CHILD_TOOLS.filter((toolName) => parentTools.has(toolName));
	}

	private refreshUsage(record: ChildRecord): void {
		if (!record.session) return;
		record.metadata.usage = readUsage(record.session);
		this.emitUpdate(record);
	}

	private updateStatus(record: ChildRecord, status: AgentChildStatus): void {
		record.metadata.status = status;
		record.metadata.updatedAt = new Date().toISOString();
		if (isTerminal(status)) record.provisionalOutputTokens = 0;
		if (record.session) {
			record.metadata.transcriptReference = record.session.sessionFile;
			record.metadata.usage = readUsage(record.session);
		}
		this.persist(record.metadata);
		if (isTerminal(status)) {
			record.unsubscribeSession?.();
			record.unsubscribeSession = undefined;
		}
		this.emitUpdate(record);
		this.scheduleParentResume(record);
	}

	private scheduleParentResume(record: ChildRecord): void {
		if (
			!this.resumeParentOnChildCompletion ||
			this.disposed ||
			(record.metadata.status !== "completed" && record.metadata.status !== "failed")
		)
			return;

		this.pendingParentResumes.add(record.metadata.id);
		if (this.parentSession.isStreaming || this.parentResumeTimer) return;
		this.parentResumeTimer = setTimeout(() => {
			this.parentResumeTimer = undefined;
			void this.flushParentResume();
		}, 50);
		this.parentResumeTimer.unref?.();
	}

	private async flushParentResume(): Promise<void> {
		if (this.disposed || this.pendingParentResumes.size === 0 || this.parentSession.isStreaming) return;

		const ids = [...this.pendingParentResumes];
		this.pendingParentResumes.clear();
		const updates = ids.flatMap((id) => {
			const snapshot = this.getAgentStatus(id)[0];
			if (!snapshot) return [];
			const detail = snapshot.result?.text || snapshot.error || "No result was returned.";
			return [`- ${snapshot.title}: ${snapshot.status}\n${detail.slice(0, 2400)}`];
		});
		if (updates.length === 0) return;

		try {
			await this.parentSession.sendCustomMessage(
				{
					customType: "agent_updates",
					content: `Delegated agent updates are ready. Review them and continue the task.\n\n${updates.join("\n\n")}`,
					display: false,
				},
				{ triggerTurn: true },
			);
		} catch {
			for (const id of ids) this.pendingParentResumes.add(id);
		}
	}

	getAgentStatus(id?: string): AgentChildSnapshot[] {
		const records = id ? [this.records.get(id)] : [...this.records.values()];
		if (id && !records[0]) throw new AgentSupervisorError(`Unknown child agent ${id}`);
		return records
			.filter((record): record is ChildRecord => record !== undefined)
			.map((record) => this.getSnapshot(record));
	}

	getAgentSession(id: string): AgentSession | undefined {
		return this.records.get(id)?.session;
	}

	async waitAgents(options: WaitAgentsOptions = {}): Promise<AgentChildSnapshot[]> {
		const selected = options.ids ? options.ids.map((id) => this.records.get(id)) : [...this.records.values()];
		if (selected.some((record) => !record)) throw new AgentSupervisorError("Unknown child agent in wait request");
		const pending = selected.filter(
			(record): record is ChildRecord => record !== undefined && !isTerminal(record.metadata.status),
		);
		if (pending.length > 0 && (options.timeoutMs === undefined || options.timeoutMs > 0)) {
			const wait = Promise.all(pending.map((record) => record.completion));
			if (options.timeoutMs === undefined) await wait;
			else {
				let timeout: ReturnType<typeof setTimeout> | undefined;
				const timeoutPromise = new Promise<void>((resolve) => {
					timeout = setTimeout(resolve, options.timeoutMs);
				});
				await Promise.race([wait, timeoutPromise]);
				if (timeout) clearTimeout(timeout);
			}
		}
		const statuses = options.ids ? this.getAgentStatusForIds(options.ids) : this.getAgentStatus();
		for (const status of statuses) {
			if (status.status === "completed" || status.status === "failed") this.pendingParentResumes.delete(status.id);
		}
		return statuses;
	}

	private getAgentStatusForIds(ids: string[]): AgentChildSnapshot[] {
		return ids.flatMap((id) => this.getAgentStatus(id));
	}

	async sendAgentMessage(id: string, message: string): Promise<void> {
		const record = this.records.get(id);
		if (!record) throw new AgentSupervisorError(`Unknown child agent ${id}`);
		assertNonEmpty(message, "message", 4000);
		if (!record.session) {
			if (record.metadata.status === "queued") {
				record.queuedMessages.push(message);
				return;
			}
			throw new AgentSupervisorError(`Child agent ${id} has no active session`);
		}
		if (record.session.isStreaming) {
			await record.session.prompt(message, { streamingBehavior: "followUp", source: "rpc" });
		} else if (!isTerminal(record.metadata.status)) {
			await record.session.prompt(message, { source: "rpc" });
		} else {
			throw new AgentSupervisorError(`Child agent ${id} is ${record.metadata.status}`);
		}
	}

	async stopAgent(id: string, status: "cancelled" | "interrupted" = "cancelled"): Promise<AgentChildSnapshot> {
		const record = this.records.get(id);
		if (!record) throw new AgentSupervisorError(`Unknown child agent ${id}`);
		if (isTerminal(record.metadata.status)) return this.getAgentStatus(id)[0];
		record.controller.abort();
		const queueIndex = this.queue.indexOf(id);
		if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
		if (record.session) await record.session.abort();
		this.updateStatus(record, status);
		return this.getAgentStatus(id)[0];
	}

	async stopAll(status: "cancelled" | "interrupted" = "cancelled"): Promise<void> {
		await Promise.all([...this.records.keys()].map((id) => this.stopAgent(id, status).catch(() => undefined)));
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.unsubscribeParent();
		if (this.parentResumeTimer) {
			clearTimeout(this.parentResumeTimer);
			this.parentResumeTimer = undefined;
		}
		await this.stopAll("cancelled");
		for (const record of this.records.values()) {
			record.unsubscribeSession?.();
			record.session?.dispose();
		}
		this.listeners.clear();
	}

	private async createDefaultChildSession(context: CreateChildSessionContext): Promise<CreateAgentSessionResult> {
		const parentSessionDir = context.parentSession.sessionManager.getSessionDir();
		const childSessionDir = join(parentSessionDir || getDefaultSessionDir(context.cwd, getAgentDir()), "children");
		const sessionManager = SessionManager.create(context.cwd, childSessionDir, {
			id: context.childId,
			...(context.parentSession.sessionFile ? { parentSession: context.parentSession.sessionFile } : {}),
		});
		return createAgentSession({
			cwd: context.cwd,
			agentDir: getAgentDir(),
			modelRuntime: context.parentSession.modelRuntime,
			settingsManager: context.parentSession.settingsManager,
			resourceLoader: context.parentSession.resourceLoader,
			sessionManager,
			model: context.model,
			thinkingLevel: context.thinkingLevel,
			tools: [...context.childTools],
			permissionMode: "plan",
		});
	}
}
