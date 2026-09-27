# Question Tool

Status: proposal. Rename the existing `ask_user` capability to the **Question Tool**
and redesign its interaction. The earlier implementation supported at most five
questions in one request; this proposal removes the fixed question-count limit and
supports iterative clarification. See `../old/harness-plan.md` §1 for the historical
implementation record and this document for the replacement direction.

## Outcome

Let the model ask the user focused questions when an answer is needed to make a
reliable plan or proceed on an underspecified task. The interaction should be quick
to understand, easy to answer with a choice or free text, and safe to repeat until
the intent is clear.

## Name and availability

- Rename the built-in model-callable tool from `ask_user` to `question` (display name:
  **Question Tool**). Update tool descriptions, prompt guidance, UI labels, tests,
  persistence/event names where appropriate, and SDK/RPC surfaces together.
- Make the tool available in Plan Mode. This is its primary use: after inspecting
  relevant context, the model can ask about unresolved requirements or decisions
  before proposing a plan.
- In other modes, the model may use it for genuinely underspecified requests or
  consequential ambiguity. It should not ask about facts available through tools,
  repeat instructions the user already gave, or interrupt for routine implementation
  choices.
- Asking a question does not grant permissions or change work mode. Tool access and
  answer handling remain governed by the session's normal permission and abort rules.

## Unlimited question rounds

- Remove the existing fixed maximum of five questions. A clarification flow may have
  as many steps/rounds as needed; the model can ask another question after receiving
  an answer, including a question whose options depend on that answer.
- Do not require the model to predict and submit every question up front. Support one
  focused question or a related batch in a tool call, return the answer to the model,
  then allow it to decide whether another round is necessary.
- There is no product-level total-question cap. Keep generic payload, context, and
  cancellation safeguards, but do not turn them into a hidden five-step limit.
- Keep only one foreground question interaction active at a time. Abort, session
  replacement, or explicit cancellation settles the pending tool call and must not
  treat a partial answer as confirmed.

## Interaction design

The new UI should be substantially clearer than the earlier Flux picker. Use Claude
Code and OpenCode as interaction references, while fitting the terminal and Flux
theme:

- Put the question in a focused dialog/panel with a short header and clear context.
  For a related batch, show progress such as `Question 2 of 3`; for sequential rounds,
  do not imply a known final question count.
- Present concise option labels with optional explanatory descriptions. Mark a
  recommended option explicitly when the model supplies one; never rely on color
  alone. Support single-select and, only when requested, multi-select answers.
- Always provide an **Other / write your own answer** path. Make free-text input
  obvious, allow multiline text when useful, and preserve its contents when the user
  navigates back.
- For a batch, allow moving among questions and reviewing/editing answers before one
  explicit submit. For a single question, require explicit confirmation; highlighting
  an option alone must not submit it.
- Make Back, Next/Submit, and Cancel visible, use configurable keybindings, and retain
  mouse operation where supported. Handle narrow terminals with wrapping and scrolling
  instead of clipping prompt or answer text.
- Keep the active model run visibly waiting while the dialog is open. On submit, return
  the exact selected option or entered text to the model and resume the same turn.
- Present cancellation distinctly from a submitted answer. Show errors inline and
  keep valid work/answers when safely returning to a previous step.

### Reference behavior researched

- **Claude Code `AskUserQuestion`:** multiple-choice questions, free-form `Other` or
  notes input, and questions that remain open until answered by default. Its `/btw`
  side-question feature is separate and should not be confused with the Question Tool.
- **OpenCode `question` tool:** questions carry a header, question text, and options;
  users can type a custom answer and navigate a multi-question batch before submitting.

References: [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference#askuserquestion-tool-behavior),
[OpenCode tools](https://opencode.ai/docs/tools/#question), and
[Claude Code `/btw`](https://code.claude.com/docs/en/interactive-mode#side-questions-with-/btw).

## When the model should ask

- Prefer inspecting the repository and conversation before asking. Ask only for
  information that cannot be established from available context and that could change
  the plan, implementation, or user-visible result.
- Plan Mode should ask before presenting a plan when a consequential requirement or
  choice is unresolved. It can ask follow-up questions over multiple rounds rather
  than guessing or forcing a decision into a single five-question form.
- In normal work mode, use questions sparingly: very vague prompts, incompatible
  requirements, consequential product choices, or missing information that blocks a
  safe/meaningful next step. Do not make the user answer a questionnaire for a clear
  task.
- Clearly separate a question from a permission prompt. An answer clarifies intent; it
  does not authorize a tool call that the permission policy would otherwise block.

## Harness, persistence, and acceptance

- Retain a UI-independent request/response service. Give each request a stable ID;
  reject stale or duplicate responses. Persist question and answer events so a
  submitted exchange can be replayed. Mark an unanswered request interrupted after
  restart rather than silently fabricating an answer or restarting the interaction.
- Serialize the Question Tool dialog with permission dialogs and other foreground
  interactions. Route abort through the service. In noninteractive hosts without a
  question handler, return an explicit unavailable result promptly and tell the model
  to ask in plain text; never hang.
- Acceptance: no fixed five-question ceiling; conditional follow-up rounds work;
  custom answers survive back-navigation; submit/cancel/abort are distinct; Plan Mode
  can ask after inspection; noninteractive execution settles safely; SDK/RPC callers
  can implement the same interaction contract.

## Open decisions

1. Whether a request may contain an arbitrary batch size or should keep each batch
   small while allowing unlimited sequential rounds.
2. Whether multi-select is required in the first version or should follow single
   select plus custom text.
3. Exact visual pattern: one-question dialog per round versus a navigable batch form
   when the model already knows several independent questions.
