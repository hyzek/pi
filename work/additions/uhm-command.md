# `/uhm` Command

Status: proposal. `/uhm` helps turn an unstructured brain dump into a precise task
before the agent does substantial investigation or implementation.

## Interaction

1. The user enters `/uhm` followed by rough notes, fragments, or a stream-of-consciousness
   request.
2. For this invocation, add a temporary system-prompt instruction to interpret and
   restructure that input. Do not persist the instruction as a session-wide mode.
3. The model produces a concise, organized restatement: intended outcome, requirements,
   constraints, assumptions, and unresolved decisions. It should preserve the user's
   meaning rather than add unstated requirements.
4. Before significant repository exploration, tool use, or changes, show the proposed
   restatement and ask the user to confirm or correct it. Use the Question Tool for
   consequential gaps; it can continue through as many clarification rounds as needed.
5. Do not begin implementation until the user confirms the restated task. After
   confirmation, continue the task under the session's normal work/permission mode.

## Prompt guidance

Suggested temporary system-prompt addition:

> The user invoked `/uhm` and provided an unstructured brain dump. First interpret it
> faithfully and rewrite it as a clear, structured task with the desired outcome,
> requirements, constraints, assumptions, and unresolved decisions. Do not invent
> requirements. Ask the user to confirm or correct this restatement before doing
> substantial investigation or making changes. Use the Question Tool for consequential
> ambiguities. Do not implement until the user confirms.

## Acceptance

- `/uhm <brain dump>` results in a faithful structured restatement and confirmation
  checkpoint before substantial work.
- The model asks follow-up questions only for material ambiguity, and does not hit an
  arbitrary question-count limit.
- No changes are made before confirmation. A correction updates the restatement and
  requests confirmation again.
- The temporary instruction ends with the invocation; it does not silently alter later
  ordinary prompts or the persistent Plan/Work mode.
