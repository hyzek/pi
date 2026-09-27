# New Naming and Additional Commands

Status: proposal. This addition records command names and descriptions visible in
the supplied main-chat slash autocomplete sketch, compared with the current built-in
command registry in `packages/coding-agent/src/core/slash-commands.ts`.

## Screenshot command entries

The sketch shows these suggestions:

| Command | Screenshot description | Current built-in status |
| --- | --- | --- |
| `/review` | Review current changes and find issues | New built-in command; see [`review-command.md`](review-command.md). |
| `/resume` | Resume a previous session | Already present. |
| `/model` | Choose which model to use | Already present as `/model`; wording differs slightly. |
| `/compact` | Summarize session context to avoid running out of context window | Already present; consider this clearer autocomplete description. |
| `/effort` | Select reasoning effort for model | New name for the current built-in `/thinking` command. |
| `/settings` | Open settings menu | Already present. |
| `/session` | Show session info and stats | Already present. |

The screenshot is a suggestion-menu state, not a complete list of all commands.
Commands such as `/review` and `/effort` do not appear in the current built-in
registry; `/thinking` does. Extension, prompt, and skill commands may also appear in
autocomplete and should remain distinguishable from built-ins where the UI supports
source labels.

## Naming proposal

- Use `/effort` for selecting reasoning effort, replacing the built-in name
  `/thinking`. The visible description should say “Select reasoning effort” rather
  than “Set thinking level.”
- Keep existing names `/resume`, `/model`, `/compact`, `/settings`, and `/session`;
  improve descriptions to explain their action and outcome in one short phrase.
- Add `/review` as a built-in slash command for reviewing current Git changes. Its
  behavior and output requirements are specified separately in
  [`review-command.md`](review-command.md).
- Add `/uhm` as a one-shot brain-dump clarification flow; see
  [`uhm-command.md`](uhm-command.md).
- Add `/btw` for a context-only side question that does not enter or steer the main
  conversation; see [`by-the-way-command.md`](by-the-way-command.md).
- Keep autocomplete descriptions concise and action-oriented. The screenshot shows
  command names in a left column and muted descriptions aligned in a right column;
  the currently selected command is highlighted with the accent color.

## Acceptance notes

- `/effort` is the built-in entry shown for reasoning effort, with no ambiguous
  duplicate `/thinking` suggestion.
- `/review` appears in slash autocomplete with the description “Review current
  changes and find issues.”
- Existing commands retain their behavior; only names explicitly listed above change.
- Autocomplete continues to combine built-in, extension, prompt, and skill commands
  without confusing their invocation behavior.
