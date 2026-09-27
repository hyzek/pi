# Plan Mode

Status: proposal. Plan Mode is a separate work-mode feature; it is not part of the
TUI structure overhaul. The TUI may display the active mode, but screen/navigation
work does not implement planning permissions or planning behavior.

## Outcome

Let the user ask Flux to plan before making changes. In Plan Mode, Flux investigates
relevant context, thinks carefully about structure and tradeoffs, and returns an
actionable plan without making edits.

## Proposed behavior

- Add `/plan` to enter Plan Mode. It sets the session's work mode and adds a
  mode-specific system-prompt instruction for subsequent model turns. The instruction
  directs the model to investigate first, reason carefully about structure,
  architecture, dependencies, risks, and alternatives, and return a concrete plan
  rather than begin implementation.
- Make the Question Tool available in Plan Mode and encourage its use after relevant
  read-only investigation when user intent or a consequential choice remains unclear.
  See `question-tool.md` for its interaction and unlimited multi-round behavior.
- Block writing/mutating tool calls. Read-only inspection (for example, reading files
  and searching/listing the repository) may remain available so the plan can be
  grounded in the code. Unknown/custom tools must not be assumed safe to call in this
  mode.
- Treat the system prompt as guidance, **not** as the security boundary. Enforce the
  no-write rule in tool availability and at tool execution, before side-effect-capable
  hooks. Keep the mode active across turns and expose its current state to the user.
- When represented in the TUI, show an explicit Plan Mode indicator while active. The
  supplied chat sketch uses purple text and a diamond marker. Switching back to normal
  work must restore the prior configured tool set rather than permanently changing
  user allow/deny settings.
- `/plan` is the proposed entry command. The exact command or interaction for leaving
  Plan Mode, and whether `/plan` itself toggles or only enters it, remain to be
  decided. Avoid silently returning to write-enabled work mode after a model turn.

## Suggested system-prompt addition

Wording to refine during implementation:

> You are in Plan Mode. Do not implement changes or attempt to write or modify files.
> First inspect the relevant context using available read-only tools. Think carefully
> about the system's structure, architecture, dependencies, constraints, edge cases,
> and tradeoffs. Produce a clear, actionable implementation plan, and identify
> important uncertainties. If a consequential decision cannot be resolved from the
> repository and conversation, ask the user. Do not claim to have made changes.

## Policy alignment

Align this feature with the capability and execution-policy design in the earlier
`../old/harness-plan.md` under “Plan-mode capabilities.” Resolve differences there before
implementation so prompt guidance and runtime enforcement describe the same mode.
