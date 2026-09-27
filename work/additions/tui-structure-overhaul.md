# TUI structure overhaul

Status: proposal. This plan separates the terminal presentation into navigable
screens and gives one top-level session multiple independent agent chats. It is a
companion to `../old/harness-plan.md`: that document covers delegation behavior,
permissions, persistence, and worker lifecycle; this document covers how those
agents and conversations are represented and navigated in the TUI.

## Outcome

Keep the main agent chat as the primary user-facing conversation, while allowing
the main agent to create and control multiple child agents. Each child has its own
conversation, transcript, model activity, and status, and can be opened in a
dedicated agent screen without replacing or mixing content into the main chat.

The terminal app becomes a small screen-based interface rather than one large chat
component tree. The main chat, agent list, and individual agent detail are separate
views with explicit navigation and state preservation. A visual redesign should
make the active conversation, agent status, and available actions obvious without
giving up the current terminal-native behaviors.

## Terms and boundaries

- **Top-level session:** the persisted user work session and its shared lifecycle.
- **Main chat:** the user-facing root conversation, owned by the main agent.
- **Child agent/chat:** an agent created by the main agent for delegated work. It
  has its own stable internal chat ID, transcript, and agent state, but belongs to the
  top-level session. The main chat also has its own internal chat ID.
- **Screen:** a TUI view, not a new process or session. Opening an agent screen
  changes what is rendered; it must not switch the active top-level session.
- **Agent screen:** the dedicated detail view for one child agent, rendered instead
  of the main chat view. It shows that agent's conversation and activity separately
  from the main chat's transcript and composer.

Keep the existing main-chat experience intact as the default/landing screen. Child
agents use the same agent capabilities and coding tools as the main agent subject to
the parent permission policy and shared workspace coordination described in
`../old/harness-plan.md`. “Same capabilities” does not mean unrestricted filesystem
access or a separate permission grant.

## Current architecture and constraints

- `InteractiveMode` currently owns one renderer and one component tree for the
  header, transcript, editor, widgets, and footer. It binds display and input to
  `runtimeHost.session` and its single `AgentSession`.
- `createChatViewport()` builds a single transcript plus a fixed input dock.
- `TuiMainScreen` and `TuiAltScreen` are interchangeable terminal renderers, not
  application screens. The screen layer should sit above them and reuse one active
  renderer rather than treating renderer modes as chat navigation.
- `AgentSessionRuntime` replaces the active session on new/resume/fork. That is
  appropriate for top-level session switching, but not for changing the visible
  child conversation.
- Session JSONL headers currently support a `parentSession` link, and entries
  support custom metadata. This is not by itself a multi-chat-in-one-session model:
  top-level session membership, child transcript references, lifecycle state, and
  recovery need an explicit design. Avoid representing child chats as forks that
  replace the root runtime.
- The example `subagent` extension launches independent processes and captures
  results. It is a useful reference for task delegation, but it does not provide
  persistent, first-class child chat views.

## User experience

### Main chat

- Startup opens the main chat and preserves its normal editor, commands,
  autocomplete, tool output, and transcript behavior.
- Every CLI open/resume of a project lands in the top-level main session and main
  chat, even if the last viewed screen was a child chat. Opening a child from the
  Agents screen is an in-session navigation to that child's internal chat ID; it does
  not replace the main session or change the next CLI landing screen.
- Show a compact agents indicator/list entry point when child agents exist or are
  running. Include each child's title, state, and a clear attention marker for
  completion or failure.
- While delegated agents are outstanding, the main run waits for their results and
  the user cannot submit a new ordinary task. Provide an explicit steering action for
  the active main run. Steering is not a new prompt/run and remains routed through the
  main agent/supervisor.
- Main-agent messages and user messages stay in the main transcript. Child
  transcripts are never appended as if they were main-agent turns; show a concise
  delegation/result reference in the main chat and link it to the child detail.
- Preserve an unfinished main editor draft while navigating away and back.

### Agents overview

- Provide an agents screen listing children, newest/relevant work first, with task,
  status, live elapsed time, model, and result/error preview. Persist the final
  duration so completed work retains its runtime.
- Expose open/inspect, stop, and return-to-main actions where valid. Destructive or
  permission-sensitive operations use existing confirmation and permission flows.
  Steering is available from the waiting main chat, not as a prompt in an agent view.
- Empty, running, waiting, completed, failed, and interrupted states have distinct
  visual treatments. A child that needs attention remains discoverable after
  leaving the screen.

### Agent detail screen

- Render the selected child chat in its own transcript view, with its own streaming
  message, tool activity, status, scrolling position, and metadata. It must not
  reuse main-chat state fields such as `streamingComponent` or `pendingTools`.
- This is a live, read-only inspection view: show the child's real-time model output,
  tool activity, and elapsed duration, but do not show an input composer or allow the
  user to prompt the child directly. The main agent remains responsible for
  supervision; user steering is sent from the waiting main chat.
- Preserve the child transcript scroll position and the main chat scroll position
  across navigation. Resizing or switching renderer mode must not reset either.
- Make parent/child identity and current status clear at all times; provide a
  direct return path to the main chat and agent list.

## Navigation and interaction model

Add a screen coordinator above the renderer with explicit screen identity and
transition behavior. Initial screen set:

1. Main chat.
2. Agents overview.
3. Agent detail for a selected child.

Navigation must be available through configurable keybindings and visible actions
(including mouse clicks in alternate-screen mode). Do not hardcode new key checks in
the UI; register defaults through the existing keybinding system. Escape returns to
the previous non-modal screen only when it will not conflict with cancellation of an
active operation or overlay. Keep renderer switching (`regular`/`fullscreen`) a
separate concern from screen switching.

On a screen transition, retain per-screen state (component/view model, scroll
position, editor draft, focus target, and transient activity) as appropriate. Route
global events such as resize, shutdown, theme changes, and agent lifecycle updates
through the coordinator to the active screen and any background screen state that
needs updating. Only the active screen owns terminal focus and visible input.

## Visual redesign

Redesign around clear hierarchy and persistent orientation, not decoration alone:

- A restrained application frame with current screen/title, parent/main identity,
  and a compact global activity/status area.
- A visually distinct main composer, separate from transcript content and from the
  child agent's execution display. Keep adequate room for long prompts and existing
  editor affordances.
- Consistent message grouping and spacing, stronger separation of user, main-agent,
  child-agent, tool, and system/status content, and less visual noise in routine tool
  output.
- Compact agent rows with consistent state indicators, elapsed time, and actionable
  focus/selection. Do not rely on color alone for state.
- Responsive behavior for narrow and short terminals: hide or condense secondary
  metadata before truncating task identity, status, or the active conversation.
- Reuse existing theme tokens, markdown rendering, terminal colors, and TUI
  components where they fit. Add theme tokens/components only for repeated concepts.
- Preserve main-screen scrollback semantics and alternate-screen scrolling, search,
  mouse selection, cursor/IME support, overlays, and accessibility through textual
  labels. Screen navigation must work in both renderer modes.

Produce text mockups for main chat, agent list, and agent detail before implementation
to settle layout and information density. The plan does not require a graphical
sidebar: choose a full-screen list/detail transition first, which works in narrow
terminals and matches the dedicated-screen requirement.

## Application and state architecture

Separate presentation state from agent runtime state:

- **Screen coordinator:** owns active screen, navigation history, global shortcuts,
  screen lifecycle, and event routing. It remounts/switches component trees without
  constructing or replacing `AgentSessionRuntime`.
- **Screen/view models:** main-chat, agent-list, and agent-detail views each own
  display-specific state. Factor reusable transcript rendering from the existing
  interactive components so main and child chats can display equivalent message and
  tool event types without sharing mutable component instances.
- **Chat registry/supervisor:** owned by the top-level runtime/session. Maps stable
  child/chat IDs to task metadata, agent/session instances, lifecycle status, and
  persistence references. The main chat has a stable chat ID of its own. Agent
  execution and cancellation flow through this owner; the UI only issues validated
  actions.
- **Per-agent event subscriptions:** update that agent's view model and persisted
  transcript. Background child events update summary/status without stealing focus
  or injecting content into the active screen.
- **Shared policy services:** reuse model/auth resolution, extension/resource setup,
  tool policy, permission mode, and approval UI through explicit session services.
  Do not share mutable transcript, active-run, event listener, queue, or tool-call
  display state between agents.

The preferred implementation is in-process, supervisor-owned `AgentSession` objects
with per-child persisted transcripts, subject to verifying extension/resource
isolation. Each child receives a task-focused context brief and fresh messages by
default, not an accidental copy of the whole main transcript. Use the worker process
approach only if shared runtime services cannot be isolated safely. Detailed worker
limits, permissions, result delivery, and crash semantics remain specified in
`../old/harness-plan.md`.

Persistence must make the top-level session the discoverable unit and preserve
stable child identity across restart. Store a child registry record (ID, parent ID,
task/title, model, status, timestamps, usage, and transcript reference) using a
versioned format compatible with current session recovery. Persist status/result
transitions and enough task linkage for main transcript entries to navigate to the
right child. On reload, unfinished child runs become interrupted and inspectable;
never silently restart work. Full child transcripts remain available even if the
main chat only includes a bounded summary.

## Delivery plan

### 1. Screen model and visual specification

- Define screen IDs, state ownership, navigation stack/return behavior, event
  routing, and keybinding defaults.
- Add text mockups and responsive rules for the three screens.
- Acceptance: each view is clearly distinct, can be navigated without replacing the
  active runtime, and has a defined behavior for focus, scroll, resize, and Escape.

### 2. Screen coordinator with existing main chat

- Extract main chat mounting and lifecycle into a screen implementation without
  changing agent behavior.
- Add a placeholder agents list and detail screen with navigation in both renderer
  modes. Keep the existing chat as the default screen.
- Acceptance: renderer mode switching and screen switching independently preserve
  the same main session, input draft, transcript, overlays, and resize behavior.

### 3. First-class child-chat registry and persistence

- Connect the supervisor lifecycle from `../old/harness-plan.md` to stable child IDs,
  independent `AgentSession` state, per-agent event subscriptions, and persisted
  transcript references. Always restore the main chat as the CLI landing view, then
  allow explicit navigation by child chat ID.
- Add agents overview status/summary and the detail view's independent transcript,
  tool activity, elapsed-time display, and scroll state. The detail view is
  inspection-only and has no prompt editor.
- Acceptance: multiple children run concurrently while the main run waits; opening a
  child shows its real-time chat; returning to main shows unchanged main chat state;
  every CLI reopen lands in main; reload restores completed children and marks
  in-flight work interrupted.

### 4. Interaction, polish, and integration

- Implement user controls (inspect, stop, return, and steer from the waiting main
  chat), completion and failure attention states, responsive layout, final styling,
  and navigation hints.
- Implement the main chat's distinct steering action while delegated work is pending;
  block ordinary new prompts until the parent receives and handles the child results.
- Ensure delegated edits use parent-bounded permission checks and approval
  serialization, and that child results are delivered to the main model.
- Acceptance: a child can stream and run tools while its detail screen is visible;
  switching screens never loses input or hides a failure; cancellation, shutdown,
  mode changes, and session reload leave no invisible child work.

## Verification

- Unit-test the screen coordinator's transitions, back stack, focus ownership,
  renderer-mode changes, resize handling, and state preservation.
- Test independent main/child transcript rendering, streaming/tool events, scrolling,
  live duration updates, no child composer, and no cross-chat event leakage.
- Test session serialization/reload for multiple children, missing/corrupt child
  references, completed results, and interrupted work.
- Test navigation and layout at narrow, short, and wide terminal dimensions in both
  renderer modes; retain existing IME, autocomplete, overlay, search, selection, and
  scrollback behavior.
- Use faux-provider tests for child lifecycle and supervisor integration; do not use
  real provider APIs or paid tokens.

## Decision to confirm before implementation

Navigation shape: full-screen agent list/detail transitions (recommended), or a
persistent split/pane layout when terminal width permits?

Recommended defaults: full-screen list/detail navigation; main chat stays the
primary user input surface; child detail is inspection-only with no composer; user
steering goes through the waiting main chat. Delegated edits are permitted when
explicitly assigned and allowed by the parent, with shared-checkout writes serialized
under the permission and ownership gates in `../old/harness-plan.md`.

## Supplied UI sketches

These sketches show two states of the main chat and one separate Agents screen. They
are visual references, not pixel-perfect specifications. The notes below distinguish
details visible in the sketches from behavior called out by their annotations.

### Main chat: command suggestions open

```text
┌ Main / new chat ──────────────────────────────────────────────────┐
│ flux  0.18.1 preview                                              │
│                                                                   │
│ Welcome back!                                                     │
│ Here to create something big? or maybe just a “big” nothingburger  │
│                                                                   │
│ model:      Deepseek V4.1 Flash @ max                             │
│ directory:  C:\dev\repo\nothing                                   │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│ › /                                                               │
├───────────────────────────────────────────────────────────────────┤
│ /review       review current changes and find issues               │
│ /resume       resume a previous session                            │
│ /model        choose which model to use                             │
│ /compact      summarize session context ...                         │
│ /effort       select reasoning effort for model                    │
│ /settings     open settings menu                                   │
│ /session      show session info and stats                           │
└───────────────────────────────────────────────────────────────────┘
```

- **Visible structure:** a thin top title strip (`Main/new chat`), then the chat
  surface. The app identity/version is at the upper left. Welcome copy and model and
  directory metadata sit near the top of the otherwise mostly empty transcript.
  The composer is a full-width horizontal band near the bottom, with command
  suggestions directly below it.
- **Color observations:** near-black chat background; charcoal title/composer bands;
  `flux` and the selected `/compact` entry are bright blue; command descriptions and
  version text are muted gray; ordinary text is light gray/white. No exact color
  values are specified by the image.
- **Behavior shown:** typing `/` opens a suggestion list containing command names
  and short descriptions. The selected item is highlighted blue. The list occupies
  the area below the composer; whether it overlays or pushes other footer content is
  not established by this sketch.

### Main chat: Plan mode enabled

```text
┌ Main / new chat ──────────────────────────────────────────────────┐
│ flux  0.18.1 preview                                              │
│                                                                   │
│ Welcome back!                                                     │
│ Here to create something big? or maybe just a “big” nothingburger  │
│                                                                   │
│ model:      Deepseek V4.1 Flash @ max                             │
│ directory:  C:\dev\repo\nothing                                   │
│                                                                   │
│                                      Tip: Use /new for a fresh ... │
├───────────────────────────────────────────────────────────────────┤
│ › Give flux a task                                                │
├───────────────────────────────────────────────────────────────────┤
│ ← manage agents  ·  ? shortcuts                    ◇ Plan mode   │
└───────────────────────────────────────────────────────────────────┘
```

- **Visible structure:** the chat layout is unchanged. The composer has placeholder
  text (`Give flux a task`), a tip appears at the lower-right of the transcript, and
  a footer spans the bottom. The footer places `manage agents` and `? shortcuts` at
  the left, with `Plan mode` aligned right.
- **Color observations:** the footer and composer use dark charcoal against the
  black transcript. `Plan mode` and its diamond marker are purple. The sketch does
  not define exact color values.
- **Behavior called out by annotation:** show the Plan mode indicator only when
  Plan mode is on; toggle the mode with `Shift+Tab`. `manage agents` is a visible
  entry point to the separate agent-management screen. The sketch does not specify
  the exact return key or whether footer actions are clickable.

### Agents screen: command center

```text
                         Agents screen
        ┌─────────────────────────────────────────────────────┐
        │ Agent command center                                │
        │ All 11    Working 0    Ready 11                     │
        │                                                     │
        │ Monitor git issues          Task details             │
        │ ├─ Review code issue #2821  ·                       │
        │ └─ Respond and close ...   ●  Status done           │
        │                              Model ...              │
        │                              Prompt                  │
        │                              ...                     │
        │                              Response after 3 turns  │
        │                              ...                     │
        │                                                     │
        │ esc back   ↑/↓ move   enter open                    │
        └─────────────────────────────────────────────────────┘
```

- **Visible structure:** a centered, bounded command-center panel on a dark
  background. Its header is followed by counts/filters (`All 11`, `Working 0`,
  `Ready 11`). Below is a two-column layout: a task/session tree at left and details
  for the selected row at right. The bottom row shows keyboard hints. The image
  annotates a session name near the left-hand task group, but its exact label and
  placement are unclear.
- **Task list:** `Monitor git issues` is a parent/group label with two indented
  tasks. The second task is selected with a light-gray rectangular highlight. A
  marker sits after each task; the annotations identify the first (working) marker
  as blinking white and the second (done) marker as green.
- **Details panel:** show status and model first, then the prompt, then a response
  preview labeled with the number of agentic turns (in this example, `Response after
  3 turns`). The selected task is done; its status text is green. Prompt/response
  content is light text, while labels such as `Status`, `Model`, and `Prompt` are
  gray.
- **Navigation behavior shown:** `↑/↓` moves selection, `Enter` opens the selected
  item, and `Esc` goes back. The destination for `Enter` and the precise meaning of
  `Ready` are not defined by the sketch. Preserve the lifecycle distinctions in this
  plan; do not make color or blinking the only status signal.
- **Responsive note:** the image only shows a wide split view. A narrow-terminal
  layout still needs design and testing; a list-then-detail transition is a possible
  adaptation, not something established by the sketch.

These sketches do not change the existing decisions: agent details remain separate
from the main transcript, the main composer remains the normal user-input surface,
and screen navigation does not replace the active top-level session. Exact RGB colors,
session-name placement, narrow-screen behavior, and any mouse interaction remain to
be specified.

## Input-block shine reference

The archived Flux TUI implementation calls this a **block shine** or **glint**. It is
not a wavy/oscillating border: a narrow brightness band sweeps horizontally across
the filled input block, then the block returns to its resting color. The behavior is
useful as a reference for subtle input feedback in this redesign; it does not imply
that the overhaul must copy the animation unchanged.

### Reference implementation

Found in archived TUI-revamp commit `a5d1b59dc` (`feat(tui): revamp TUI selectors
and work-mode controls`, 2026-09-08):

- [Shared shine math](../old/export/09-a5d1b59dc-feat-tui-revamp-tui-selectors-and-work-mode-controls/packages/tui/src/shine.ts)
- [Editor block animation](../old/export/09-a5d1b59dc-feat-tui-revamp-tui-selectors-and-work-mode-controls/packages/tui/src/components/editor.ts)
- [Input shine colors and effort variant](../old/export/09-a5d1b59dc-feat-tui-revamp-tui-selectors-and-work-mode-controls/packages/coding-agent/src/modes/interactive/theme/input-shine.ts)
- [Startup and max-effort triggers](../old/export/09-a5d1b59dc-feat-tui-revamp-tui-selectors-and-work-mode-controls/packages/coding-agent/src/modes/interactive/interactive-mode.ts)

Core phase math, simplified without changing the algorithm:

```ts
const t = clamp01(u);
const position = t * t * (3 - 2 * t); // smoothstep: eased left-to-right travel
const envelope = Math.sin(Math.PI * t); // fade in, peak, fade out
```

At each column, intensity is a linear falloff from the moving center, multiplied by
the envelope, then quantized to 24 levels. The editor runs 24 frames at 40 ms per
frame (about 960 ms), requests a redraw per frame, and stops back at the exact resting
fill. The default band half-width is 25% of the row, clamped to 6–28 columns. It is
counter/frame-driven rather than based on wall-clock phase. The first keystroke
cancels the shine. A row offset can optionally stagger rows into a diagonal sweep;
the input-box default uses no row offset.

### Colors and triggers

- The block uses the theme's `inputBg` fill. For the neutral launch shine, a dark fill
  blends toward white; a light fill blends toward `#3c3c3c`, selected from the fill's
  luminance so the animation remains visible. Peak background blend is 0.42.
- The placeholder brightens toward the theme's normal text color during the band
  (peak blend 0.75), maintaining contrast against the changing background. The
  placeholder is display-only; the shine does not affect editor contents.
- Startup starts the one-shot animation **after the UI's first paint**, so initial
  frames are visible. The input implementation is in `Editor.startBlockShine()`;
  the interactive app configures it with `blockFill` and `blockShine`.
- When reasoning effort makes a real transition into effective `max`, the same
  animation restarts tinted to the theme's `thinkingMax` color (dark-theme example:
  `#ff5f3c`; light-theme example: `#c2410c`). It also runs when `/effort` or the
  effort-cycle keybinding selects max. Selecting max on a model that clamps the
  request to a lower level does not trigger it. Re-selecting max does not replay it.
- The max variant changes the background glint only; the placeholder keeps its
  neutral foreground fade to avoid putting effort-colored text on an effort-colored
  band. If max is already active at startup, the launch glint remains neutral.
