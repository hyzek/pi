# Sub-agents

Status: proposal. This is the core agent-orchestration addition behind the Agents
command center. It defines how the main model creates child agents, waits for them,
receives their results, and lets the user inspect their independent chats. It
complements `../old/harness-plan.md` (the earlier runtime, policy, and persistence plan) and
`work/additions/tui-structure-overhaul.md` (screens and presentation).

## Outcome

The main model can delegate bounded tasks to one or more child agents through a tool
call. Each child has a resolved model, reasoning effort, prompt/instructions, task,
and independent internal chat ID/transcript. Children execute asynchronously and may
run concurrently, while the main run waits for their results. The user can inspect
live progress and steer the waiting main run, but cannot submit a separate ordinary
prompt until the outstanding delegation has been handled.

## Agent creation

### Tool call and required resolved fields

Provide a built-in model-callable agent-creation tool, using the supervisor as the
authority for validation and lifecycle. Each created child must have all of these
resolved values recorded:

- **Model:** selected per spawn or resolved from the configured default.
- **Reasoning effort:** selected per spawn or resolved from the configured default,
  then validated against the selected model's supported effort levels.
- **Prompt/instructions:** selected per spawn or resolved from the configured default
  agent prompt. This is the child agent's role/instruction prompt. The delegated task
  itself is separate and remains required on each spawn.

The main model may override the configured model, effort, or agent prompt for an
individual child. Resolve each field independently: explicit per-spawn value first,
otherwise the configured default. Validate model/auth and effort compatibility before
starting; fail with an actionable result rather than silently choosing a different
provider, model, or effort. Do not place credentials in child prompts or task records.

Illustrative configuration shape (exact names and defaults remain to be finalized):

```yaml
agents:
  defaults:
    model: provider/model-id
    reasoningEffort: high
    prompt: "You are a delegated coding agent. Follow the assigned task and report findings or changes."
  maxConcurrent: 2
```

The exact model and reasoning-effort defaults should be user-configurable rather
than hardcoded to a paid provider. Defaults must be inspectable and documented; the
runtime must not silently pick an unrelated fallback if configuration cannot be
resolved.

### Task and context

- A spawn requires a bounded task prompt describing the requested work and expected
  output. Keep this distinct from the configurable agent prompt/instructions.
- Give the child a fresh conversation by default with its task, relevant context
  brief, accepted user decisions, project instructions, and relevant paths. Do not
  clone the whole main transcript or pass provider-specific message structures.
- Assign stable child and internal chat IDs. Persist the selected model, effective
  reasoning effort, resolved prompt/instruction version, task, parent ID, status,
  timestamps, duration, usage, result, and transcript reference.
- The main model chooses which bounded tasks to delegate and may request per-child
  overrides. Respect configured concurrency and policy limits.

## Asynchronous execution and parent wait

- Agent creation starts child work asynchronously. Multiple children may execute
  concurrently within the configured limit; they each stream events to their own
  transcript and status model.
- The main model's orchestration waits for outstanding child outcomes rather than
  treating the task as finished while results remain unhandled. Once the children
  settle, deliver their structured results to the main model so it can review them,
  resolve conflicts, continue requested work, and report to the user.
- For each delegated batch, wait until every child reaches a terminal state
  (completed, failed, stopped, or interrupted) before resuming the parent model with
  the batch results. A single child's failure does not silently discard results from
  siblings or start a new user turn.
- Do not accept a new ordinary user task into the main chat while this delegated
  operation is outstanding. Provide a distinct **steer** action for the active main
  run. Steering is attached to the current orchestration; it is not a new user turn
  or a direct child prompt. The main model/supervisor decides whether to forward it,
  change priorities, or stop work.
- The user may inspect any child while the main run waits. Opening a child changes
  only the visible chat; it does not pause, restart, or replace the main run.
- Clarify cancellation semantics: interrupting the main run should cancel its child
  work and active tools, subject to reporting any effects already completed. Stopping
  one child should settle that child result without silently cancelling siblings.

The previous harness-plan recommendation that the parent continue useful work while
workers run conflicts with this wait-barrier requirement. For this addition, the main
run waits for delegated results before accepting a new task; keep child concurrency
asynchronous, not parent/user-turn concurrency. Reconcile the lifecycle API in
`../old/harness-plan.md` before implementation.

## Execution, edits, and reporting

- A child may perform the work requested by its task, including file modifications,
  only when the parent's current permission mode and workspace policy allow it.
  Delegation does not grant a child broader permissions than the parent.
- The supervisor serializes shared-checkout write ownership as described in
  `../old/harness-plan.md`. Parallel readers are allowed; concurrent writers require a
  later explicit workspace-isolation design. Permission checks apply before every
  tool call and before hooks that may cause side effects.
- Each terminal result returned to the main model includes status, bounded result
  text, elapsed duration, effective model/effort, changed-file summary when available,
  and the stable child/chat ID. Keep the full child transcript available for review.
- The child reports what it investigated or changed, files affected, verification
  performed, and blockers. The parent remains accountable: it reviews child output
  and edits, determines whether the delegated task was fulfilled, and summarizes the
  result to the user. Child output must not be injected as if it were a main-model
  assistant turn.
- Failures, stops, timeouts, and interruptions return explicit statuses and useful
  partial results where safe. Never silently retry or duplicate completed mutations.

## User experience and Agents command center

### Main chat

- Every CLI open/resume of a project starts in the top-level main session and main
  chat, regardless of which child chat was last inspected. Child navigation is
  session-local and never changes the CLI landing target.
- While child work is outstanding, show that the main run is waiting and surface
  child status/duration. Disable ordinary prompt submission, but provide an explicit
  steering affordance for the active run.
- When all awaited results are available, resume the main model with those results.
  The main model then reports completion, requests more work, or presents its final
  response; only after the run settles can the user submit a new ordinary task.

### Agent detail

- Each child chat is addressed by its stable internal chat ID and has its own
  transcript, live streaming state, tool events, status, scroll position, and
  elapsed-time clock.
- Opening a child displays its real-time model progress in an inspection-only chat
  window. There is no composer and no direct user-to-child prompting. Steering remains
  in the main chat and goes through the main model/supervisor.
- Show effective model and reasoning effort, task/prompt, lifecycle state, and live
  elapsed duration while running. On completion, freeze/display final duration and a
  bounded result summary; keep the complete transcript inspectable.
- On return, restore the main chat's exact transcript, scroll position, and any
  in-progress steering draft. Viewing a child must not steal main-chat state or input.

### Agents overview

- List/filter child agents by state; show title/task, state, live or final elapsed
  duration, model, and result/error summary. Opening a row navigates to that child's
  internal chat ID. Keep failures and completed-but-unreviewed results discoverable.
- The overview and detail views are navigation/inspection surfaces, not alternate
  user chat sessions. Stopping a child requires the applicable confirmation and
  permission handling.

## Persistence and recovery

- The top-level session remains the durable, discoverable unit. It owns the main chat
  ID and a registry of child chat IDs, task/config resolution, lifecycle, elapsed
  time, usage, result linkage, and transcript references.
- Persist child transcripts independently and record parent-to-child/task-result links
  in the main transcript so the parent result can be traced to the corresponding
  detail chat. Do not merge child turns into the main chat transcript.
- On CLI open/resume, restore the main chat as active, even if the most recently
  viewed screen before exit was a child. Completed child chats remain inspectable.
- After a crash/restart, mark in-flight children interrupted; never silently restart
  delegated work or repeat mutations. Deliver persisted terminal results to the main
  model only when session recovery can do so without duplicate result consumption.

## Delivery and acceptance

1. **Resolved child configuration and tool contract:** defaults, per-spawn overrides,
   validation, required task, and stable IDs. Accept when every child has a resolved
   model, effort, and prompt, with actionable errors for invalid configuration.
2. **Concurrent children and wait barrier:** launch bounded work asynchronously,
   block ordinary user prompts while outstanding, support steering, and deliver
   results to the parent exactly once. Accept when multiple children can finish in
   any order and the main model resumes with all required outcomes.
3. **Live agent chats and duration:** independent child transcript IDs, real-time
   progress, live/final elapsed time, and inspection-only detail screens. Accept when
   CLI reopen always lands in main and opening a child never changes the active root
   session or enables a child composer.
4. **Delegated implementation and recovery:** parent-bounded permissions, serialized
   writes, result review/reporting, explicit failure/cancellation, and reload behavior.
   Accept when a child can make an authorized change, report it to the main model, and
   the parent can review and summarize it without cross-chat transcript leakage.

Test with faux providers. Cover per-field default/override resolution, unsupported
effort, concurrent completion order, steering versus new-prompt rejection, duplicate
result prevention, duration persistence, child failure/stop, permission changes,
serialized writes, child transcript streaming, CLI landing behavior, and interrupted
recovery. Do not use real provider APIs or paid tokens.

## Decisions to resolve

1. Final configuration keys and shipped default values for model, effort, and agent
   prompt; whether unset config inherits the main model or requires an explicit value.
2. Exact steering interaction and which kinds of instructions may be sent during the
   wait barrier.
3. Whether one spawn call creates one child or a batch, and the default concurrency
   limit.
4. Which child tasks may write in the first release, given shared-checkout ownership
   and permission/approval policy.
