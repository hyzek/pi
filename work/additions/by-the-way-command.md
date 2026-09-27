# `/btw` Side-Question Command

Status: proposal. Add a `/btw` (“by the way”) command for asking about the current
session without steering or interrupting its main conversation. This is a user-initiated
side question, distinct from the model-callable Question Tool.

## Behavior

- `/btw <question>` starts an independent, single-answer side exchange using the
  conversation context available when the command is invoked.
- It does not interrupt, cancel, or steer a main-model turn that is already running.
  It must preserve the main prompt draft and return the user to the same main session
  and active turn after the answer is dismissed.
- Neither the side question nor its answer is appended to the main conversation
  history or supplied as a new main-model turn. The side answer must not change the
  main model's task, tool plan, or pending delegation.
- Keep the side exchange context-only: do not read files, search, execute tools, or
  mutate state to answer it. If the question needs fresh investigation or action, say
  so and invite the user to ask in the main conversation instead.
- Present the answer in a dismissible overlay/panel. Dismissing it returns to the
  original prompt and running turn without losing editor state.
- To continue with another side question, the user invokes `/btw` again. Optionally
  retain a small, session-local side-question history for browsing, but keep it
  separate from the main transcript and clear it when the session ends.
- `/btw` without an argument may reopen the latest side answer if side-question
  history is retained; otherwise show concise usage help.

Claude Code reference: [`/btw` side questions](https://code.claude.com/docs/en/interactive-mode#side-questions-with-/btw).
Claude Code describes its terminal version as an in-memory, dismissible overlay that
can run while the main turn is working, answers only from existing context, and keeps
the exchange out of conversation history. Use that as a behavioral reference without
requiring identical keybindings or retention details.

## Acceptance

- `/btw <question>` returns an answer without creating a main transcript turn or
  changing what the main model is doing.
- It works while a main turn is active and restores the exact main input draft/turn
  when dismissed.
- The side exchange makes no tool calls. Requests requiring fresh context are clearly
  redirected to the main conversation.
- The Question Tool and `/btw` remain distinct: the former lets the model ask the user
  and resumes its turn with the answer; the latter lets the user ask the model outside
  the main conversation history.
