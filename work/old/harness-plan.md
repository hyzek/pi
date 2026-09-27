# Flux harness capabilities

Status: staged implementation plan, 2026-09-15. Question service, interactive/RPC picker,
plan-mode policy, and read-only supervisor/visibility gates implemented; write-capable
children, nested delegation, and push-based status updates remain deferred.
User choices below remain open until answered; recommendations are planning defaults.

## Outcome

Make Flux a complete coding-agent experience on top of its existing provider adapters:
the model can ask structured questions and delegate bounded work to other agents.
Both capabilities ship enabled as part of Flux, without installing example extensions.
Retain the existing coding tools and provider abstraction.

## Existing foundations

- `packages/coding-agent/examples/extensions/questionnaire.ts` already implements
  options, custom text, multiple question tabs, and a final review for multiple questions.
  Single questions currently submit immediately. It is TUI-only, ignores its abort
  signal, permits duplicate IDs, and hardcodes navigation keys. Reuse the interaction
  pattern, with a tested state model and configurable keys.
- `packages/coding-agent/examples/extensions/subagent/` implements subprocess workers,
  isolated model context, parallel batches, chains, streaming, and usage reporting.
  Its tool waits for the batch to finish. It uses ephemeral child sessions and does
  not pass Flux permission mode through its dispatch defaults. Do not enable this
  example unchanged as the built-in implementation.
- `core/agent-session.ts` currently removes every active tool in plan mode and blocks
  all calls at execution time. `core/permission-mode.ts` also tells the model not to
  call tools. Both layers must change together for the picker to work in plan mode.
- `core/sdk.ts` provides `createAgentSession`; use the session abstraction and existing
  model/auth runtime instead of building another provider client.

## 1. Structured question picker

**Follow-up direction:** the implemented `ask_user`/five-question design below is
historical. The next design renames the capability to the **Question Tool**, removes
the fixed question-count ceiling, and makes it especially useful in Plan Mode. See
`../additions/question-tool.md`; that proposal supersedes the limits and naming
below without changing the record of what the earlier implementation did.

### User interaction

Example: the agent discovers three plausible storage approaches. It calls
`ask_user` with the question, short option labels, and one-sentence tradeoffs.

```text
Storage                         Question 1 of 2
Where should task history live?

1. Local SQLite (Recommended)
   Simple local persistence with structured queries.
2. JSON files
   Easy to inspect and copy, with less query support.
3. Remote database
   Shared access, with service setup required.
4. Write my own answer

Back                           Next
```

- Normally three model-authored options; allow two when a third would be filler.
- The harness always adds custom input as the last choice. The model cannot remove it.
- One question at a time; progress labels and navigation allow revisiting answers.
- Selection advances to the next question. After the last question, show a review
  of every answer with Edit, Submit answers, and Cancel actions.
- Review also applies to a single question. Highlighting an option does not submit it.
- Keep edited custom text when moving backward. Reject empty custom answers.
- Cancel produces an explicit cancelled result; no drafts become user decisions.
- Use Flux's gray input surface, colored selection, compact transcript summary,
  wrapping and scrolling for small terminals, and configurable navigation bindings.

### Tool contract and model behavior

`ask_user({ questions: [...] })` accepts 1–5 questions per call. Each question has
a stable ID, short header, prompt, 2–3 options with stable IDs, descriptions, and
at most one recommended option. Validate bounds, unique IDs, and text lengths
before displaying anything. Keep the schema simple for tool-calling providers.

Return `submitted`, `cancelled`, or `unavailable`, plus answers keyed by question
ID. Submitted answers contain the selected option ID or custom text and the exact
visible label. Persist the question/answer pair for transcript replay and resume.

The model should ask about meaningful user preferences or consequential ambiguity,
after inspecting what it can. It should not ask the user to locate facts available
in the repo, reconfirm explicit instructions, or choose routine implementation details.
Question submission does not grant tool permissions or change permission mode.

Version 1 supports a fixed batch of questions. If a later question depends on an
answer, the model receives the submitted batch and issues a follow-up call. A
branching form definition is deferred until there is a demonstrated need.

### Harness integration

Introduce a UI-independent request/response service owned by the session. The
tool awaits its result; the TUI presents it. Route abort through the service so
interrupting or changing sessions closes the picker and settles the pending call.
Serialize picker and approval dialogs through one foreground interaction queue.

Expose the service to SDK clients with a handler and to RPC clients with request
and response messages carrying request IDs. Reject stale/duplicate responses.
Without an interactive handler, return `unavailable` immediately and instruct
the model to ask in text; never hang a print-mode run or fabricate an answer.
On restart, show unfinished requests as interrupted, not submitted.

## 2. Plan-mode capabilities

Recommended: plan mode can ask questions, read files, search/list the repository,
and delegate read-only research. It cannot edit, write, execute arbitrary shell
commands, or start implementing agents. The user switches modes to begin execution.

Use explicit tool capabilities and an execution-time policy, not just a prompt.
For initial plan-mode inspection, expose the existing dedicated read/grep/find/ls
tools rather than reuse the manual-mode shell-command prefix heuristic. Commands
that look read-only can still have side effects through options or invocation.
Unknown extension tools stay unavailable in plan mode until explicitly classified
through a trusted registration mechanism. A model-supplied name is not authority.

Preserve configured tool allowlists/denylists when entering or leaving plan mode.
Apply the same rules in interactive, SDK, RPC, and child sessions. Permission
checks must precede tool-call hooks capable of side effects.

Alternative if requested: keep the current no-inspection plan mode and allow only
`ask_user`. This yields plans based solely on conversation context.

## 3. Sub-agents

### Parent/child behavior

Example: for an authentication change, the main agent sends a child to map auth
flows while it examines the requested UI change. The child returns relevant file
locations and findings; the parent uses them to implement and verify the result.

Expose a small lifecycle API:

- `spawn_agent`: task, short title, expected output, optional configured role/model,
  and context brief; returns a child ID immediately.
- `wait_agents`: wait for selected children or return their latest status/results.
- `send_agent_message`: clarify or follow up with an existing child.
- `stop_agent`: cancel one child and its active tools.

The supervisor tracks queued, running, waiting-for-approval, completed, failed,
and cancelled states. Deliver completion events at safe parent turn boundaries,
with an event ID to prevent duplicate result consumption. Completion while the
parent is idle should resume it when delegated work remains outstanding.

The parent remains responsible for checking results and completing the user task.
The model prompt encourages delegation only when a bounded task can run alongside
useful parent work, or isolation offers a clear benefit. Avoid duplicate work and
delegating trivial steps. Start with at most two concurrent children, configurable,
and no child-created grandchildren in version 1.

### Context, models, and execution

- Fresh child context by default: task, relevant conversation brief, accepted user
  decisions, project instructions, and relevant paths. Do not clone the full history
  or leak unrelated provider-specific message structures across models.
- Inherit parent provider/model and supported reasoning effort. Allow user-configured
  role overrides under Flux config; do not hardcode paid-provider model choices.
- Reuse model resolution and authentication. Invalid overrides produce actionable
  errors; never silently select another provider or expose secrets in task records.
- Recommended first runtime: supervisor-managed child AgentSessions in the same
  process, each with its own messages, tools, lifecycle, and session persistence.
  Verify SDK/resource-loader isolation before committing to this implementation.
  Use the existing worker transport if shared process state prevents reliable isolation.
- Separate model context is not a filesystem sandbox. Permissions and workspace
  coordination are enforced independently.
- Record task ID, parent ID, model, workspace, status, usage, and transcript reference
  in session metadata. On application restart mark unfinished children interrupted;
  do not silently repeat mutations. Completed results remain inspectable.

### Permissions and workspace coordination

Children cannot exceed the parent's permissions. Manual-mode mutations go through
the same approval UI, labeled with the child and proposed action. Children route
product questions to the parent; only the parent opens user questionnaires.

When permission mode becomes more restrictive, pause dispatch and cancel or drain
affected in-flight operations before reporting that the new mode is active. Recheck
policy before each tool call; revocation cannot undo effects already completed.

For the first implementation, share the checkout with parallel readers and one
writer at a time across parent and children. Reserve write ownership for the full
implementation subtask, not individual file writes: two agents can otherwise make
incompatible decisions from the same old file even when writes are serialized.
Treat arbitrary shell commands as potentially mutating. The parent can continue
independent inspection while a worker owns implementation, then review its diff.

Subsequent milestone: isolated worktrees for parallel implementing agents, explicit
integration of their changes, dirty-checkout snapshot policy, and conflict handling.
Never use resets, stashes, or automatic commits to coordinate a user's shared checkout.
Non-Git projects retain the single-writer path.

### Visibility, cancellation, and limits

Show compact child rows with task, state, elapsed time, and model; expose details
through `/agents` to inspect output, send instructions, or stop a child. Include
child tokens in aggregate usage without double-counting the parent's result input.
Show monetary cost only when provider pricing is available.

Use configurable concurrency, turn/token, and elapsed-time limits. Token ceilings
are checked between requests and can overshoot by the active request's output;
also cap per-request output. Do not assume cost metadata exists for custom endpoints.
Limit result text fed to the parent and retain full transcripts for inspection.

Interrupting the main run cancels its children and tool processes. Closing the
session does the same. A child failure is reported once and does not automatically
restart completed or mutating work. Parent finalization must explicitly resolve,
cancel, or report outstanding children; none should run invisibly after the task ends.

## Delivery order and acceptance gates

1. **Question service and picker.** Built-in tool, TUI wizard, review, cancellation,
   persistence, SDK/RPC contract, and noninteractive fallback. Accept when two
   questions including a custom answer can be revised and submitted exactly once.
2. **Plan-mode integration.** Change prompt, advertised tools, and execution policy
   together. Accept when the picker works in every mode and plan-mode mutation is
   rejected even when a tool is invoked directly or via an extension path.
3. **Read-only delegation.** Supervisor, immediate spawn, completion delivery, model
   inheritance, usage, cancellation, and `/agents`. Accept when two children run
   alongside the parent and their results survive session reload.
4. **Implementing children.** Permission routing and shared-checkout write ownership.
   Accept when a child edits under the correct mode, parent reviews the result, and
   a second writer cannot start until ownership is released after success or failure.
5. **Parallel implementation.** Worktrees and explicit integration, after the first
   four milestones prove useful. This is a separate scope from initial delegation.

Test the picker state transitions (back/edit/custom/review/cancel), malformed schemas,
abort and stale responses, resize, and narrow-terminal rendering. Test the supervisor
with the faux provider: concurrency limits, result delivery races, child failures,
parent interruption, mode changes, approval serialization, write ownership, and reload.
Exercise ordinary tool calls through representative existing adapter fixtures; do not
require real API keys or paid tokens for tests. Run specific new tests and `npm run check`
after code changes, with a controlled TUI smoke test for the completed UI.

## Decisions requested

1. Plan mode: repository inspection (recommended) or questions only?
2. Sub-agent scope: research and implementation (recommended, delivered in stages)
   or research/review only?
3. Model selection: inherit with configured overrides (recommended), one dedicated
   worker model, or parent choice from a user-maintained allowlist?

Other proposed defaults: both features built in; two concurrent children; no nested
delegation initially; fixed question batches with final review; shared checkout with
one writer initially. These remain editable product decisions, not implemented behavior.
