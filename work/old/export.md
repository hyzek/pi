# Flux fork — export inventory

Everything this repository does differently from the upstream **Pi Agent**
(`github.com/earendil-works/pi`), written so the work can be re-applied onto a
clean fork instead of carried as a diverged branch.

Audience: whoever rebuilds the fork. It is a technical inventory, not user
documentation.

**Start here if you only read one thing:** §1 (which branch holds what) and §8
(what is broken or fake). §4 is the TUI spec, §10 is the port plan.

## Contents

- [0. How this was produced](#0-how-this-was-produced)
- [1. The three snapshots](#1-the-three-snapshots)
  - [1.1 A branding-key divergence to be aware of](#11-a-branding-key-divergence-to-be-aware-of)
- [2. Commit hygiene on `openai-alike`](#2-commit-hygiene-on-openai-alike)
- [3. Change inventory by bucket](#3-change-inventory-by-bucket)
- [4. TUI — the detailed spec](#4-tui--the-detailed-spec)
  - [4.1 `packages/tui` library](#41-packagestui-library)
  - [4.2 Interactive mode](#42-interactive-mode-packagescoding-agentsrcmodesinteractive)
  - [4.3 Menu style — the normative spec](#43-menu-style--the-normative-spec)
  - [4.4 Input box and startup shine](#44-input-box-and-startup-shine)
  - [4.5 Theme](#45-theme)
  - [4.6 Keybindings](#46-keybindings)
- [5. Core features](#5-core-features)
  - [5.1 Question service](#51-structured-question-service--interactive-picker)
  - [5.2 Agent supervisor + chat tabs](#52-agent-supervisor--chat-tabs)
  - [5.3 Permission modes](#53-permission-modes)
  - [5.4 Session, settings, prompt plumbing](#54-session-settings-prompt-plumbing)
- [6. RPC and SDK surface](#6-rpc-and-sdk-surface)
- [7. Deletions](#7-deletions)
- [8. Bugs, leftovers, and things not to carry over](#8-bugs-leftovers-and-things-not-to-carry-over)
- [9. Docs inventory](#9-docs-inventory-what-to-carry-what-to-bin)
- [10. Port plan](#10-port-plan)
  - [10.1 Collision analysis](#101-collision-analysis)
  - [10.2 Suggested order](#102-suggested-order)
  - [10.3 Decisions to make on the new fork](#103-decisions-to-make-on-the-new-fork)
- [11. Verification status](#11-verification-status)

---

## 0. How this was produced

The fork and upstream share history, so the fork diff is a plain two-dot diff
from the last common commit.

```bash
git fetch --no-tags https://github.com/earendil-works/pi.git '+refs/heads/*:refs/remotes/upstream/*'
git merge-base HEAD upstream/main        # → 6160683a4  (2026-09-08)
git diff --stat 6160683a4 HEAD           # → 268 files, +9217 −4090
git diff 6160683a4 HEAD                  # the ground truth for everything below
```

Everything in this document is derived from that diff plus the current file
contents. Where a number or a symbol is quoted, it was read out of the tree, not
inferred.

---

## 1. The three snapshots

| Ref | Upstream base | Contents |
|---|---|---|
| `openai-alike` (**HEAD**, `a5d1b59dc`) | `6160683a4`, v0.85.1+30, 2026-09-08 | rebrand (partial) **+ all flux features** |
| `Fork-V2` (`b13c8d5c8`) | `b6419322e`, 2026-09-21 | **only** the clean rebrand — no features |
| `upstream/main` (`d6af72e`) | — | v0.87.1, 231 commits ahead of the flux fork point |

`Fork-V2` is upstream @ 2026-09-21 plus exactly **one** non-upstream commit,
`b13c8d5c8` "rename" (700 files, +6017/−6000). Verified by direct file probe that
it contains **none** of:

```
packages/coding-agent/src/core/question-service.ts        MISSING in Fork-V2
packages/coding-agent/src/core/agent-supervisor.ts        MISSING in Fork-V2
packages/coding-agent/src/core/permission-mode.ts         MISSING in Fork-V2
packages/coding-agent/src/modes/interactive/components/question-picker.ts  MISSING
packages/tui/src/shine.ts                                 MISSING in Fork-V2
flux.md / harness-plan.md / inputbox.md                   MISSING in Fork-V2
```

**Consequence:** `Fork-V2` is the clean base, and every feature in §5–§6 still has
to be ported onto it. This document is that port list, plus the TUI spec.

### 1.1 A branding-key divergence to be aware of

| Ref | Branding key in `packages/coding-agent/package.json` |
|---|---|
| `6160683a4` (upstream) | `"piConfig": { "configDir": ".pi" }` |
| `openai-alike` | `"piConfig": { "name": "flux", "configDir": ".flux" }` — key **not** renamed |
| `Fork-V2` | `"fluxConfig": { "name": "flux", "title": "ƒ", "configDir": ".flux" }` |

Upstream's schema is just `configDir`; `openai-alike` added a `name` field and
left the key as `piConfig`; `Fork-V2` renamed the key *and* added `title`.
`Fork-V2`'s shape is the cleaner one — prefer it.

---

## 2. Commit hygiene on `openai-alike`

Hard numbers, because this is the main reason the branch "doesn't cut it":

- **15 commits** since the fork point, of which **9 are unique**. A self-merge
  (`d546ca7af` "Merge branch 'openai-alike' … into openai-alike") duplicated five
  commits verbatim under new hashes:

  | duplicated | hashes |
  |---|---|
  | `fix(coding-agent): reject manual permission mode over RPC` | `b26ffd087` / `291a86736` |
  | `fix(coding-agent): close read-only shell allowlist bypasses` | `637044014` / `af2cab80a` |
  | `fix(coding-agent): repair tests broken by the pi->flux rename` | `3635f5130` / `ad9066680` |
  | `fix(scripts,docs): complete the pi->flux env var rename` | `4f79bf46d` / `1a63a6b7f` |
  | `chore: sync lockfile with the flux bin rename` | `c57f4bd9f` / `f544c2086` |

- The nine unique changes, in order:
  1. `236fd8fb0` feat(coding-agent,tui): establish flux fork
  2. `4406f2870` feat(coding-agent): add work summary bar and remove workflows
  3. `fe435726a` feat(ai,coding-agent,tui): add question service and agent supervision
  4. `637044014` fix(coding-agent): close read-only shell allowlist bypasses
  5. `3635f5130` fix(coding-agent): repair tests broken by the pi->flux rename
  6. `4f79bf46d` fix(scripts,docs): complete the pi->flux env var rename
  7. `c57f4bd9f` chore: sync lockfile with the flux bin rename
  8. `b26ffd087` fix(coding-agent): reject manual permission mode over RPC
  9. `a5d1b59dc` feat(tui): revamp TUI selectors and work-mode controls
- One untracked file: `packages/coding-agent/dbg-ms.txt` (20-line captured TUI
  frame dump). Debug artifact — do not carry over.
- Version reset `0.85.1` → `0.1.0` across every workspace package and lockfile.
- All 10 `.github/workflows/*.yml` deleted (~2000 lines) — **the fork has no CI.**

A clean fork should land this as ~8 focused commits with no self-merge.

---

## 3. Change inventory by bucket

### Bucket A — already handled by `Fork-V2`

The `pi` → `flux` rebrand, and `Fork-V2`'s version is *more* complete than
`openai-alike`'s. Do not re-port; use `Fork-V2`. It covers:

- branding hub key `piConfig` → `fluxConfig`, with `name` + `title: "ƒ"`
- bin `pi` → `flux`, config dir `~/.pi` → `~/.flux`, `PI_*` → `FLUX_*` **including**
  the double-underscore internals (`__PI_INTERNAL_SPAWN`, `__PI_SESSION_WORKER_*`)
  that a word-boundary sweep misses
- `pico3` session kinds `pi.*` → `flux.*`, the `pkg.pi` extension manifest field
  (`pkg.pi.extensions` → `pkg.flux.extensions`, and `core/pi-manifest.ts` →
  `core/flux-manifest.ts` — **`openai-alike` still reads `pkg.pi` from
  `pi-manifest.ts:20`**, so this is a concrete case where the port must follow
  `Fork-V2`, not HEAD), the `pi-messages` wire protocol, OAuth/UA attribution,
  the `\x1b_pi:c\x07` cursor marker, the `PI_CLIPBOARD` X11 atom (with rebuilt
  linux prebuilds)
- npm package names `@earendil-works/pi-*` **deliberately preserved** (identifiers,
  not branding)
- session fixture / inline snapshot updates the rename invalidated

### Bucket B — the port list (features `Fork-V2` does not have)

| Area | New files | Modified files | Section |
|---|---|---|---|
| Question service + `ask_user` tool | 5 | ~10 | §5.1 |
| Agent supervisor + chat tabs | 3 | ~8 | §5.2 |
| Permission modes | 1 | ~6 | §5.3 |
| TUI: shine + editor input box | 2 | 4 | §4.1, §4.4 |
| TUI: selector/menu revamp | 3 | ~12 | §4.2, §4.3 |
| Work summary bar / footer rework | 1 | 2 | §4.2 |
| RPC + SDK surface | 0 | 7 | §6 |
| Security fix: read-only shell allowlist | 0 | 1 | §5.3.2 |
| Startup/quiet defaults, theme, keybindings | 0 | ~8 | §4.5, §4.6 |

31 files are **added** by the fork (conflict-free to port); 180 of the 268 changed
files are *also* touched by `Fork-V2`'s rename commit, so those will conflict and
want manual re-application. See §10.

---

## 4. TUI — the detailed spec

The user-visible product is mostly this section. Two layers: the reusable widget
library `packages/tui`, and the coding agent's interactive mode.

### 4.1 `packages/tui` library

**794 insertions / 112 deletions across 20 files** (2 added, 18 modified).

#### 4.1.1 `src/shine.ts` — NEW (+53)

Pure math, no ANSI/timers/theme. Exact exports:

```ts
export const SHINE_LEVELS = 24;                 // discrete ANSI emission levels
export const SHINE_FALLOFF_FRACTION = 0.25;
export const SHINE_FALLOFF_MIN_COLS = 6;
export const SHINE_FALLOFF_MAX_COLS = 28;

export function clamp01(value: number): number;
export function smoothstep(u: number): number;                 // u*u*(3-2*u)
export function shinePhase(u: number): { position: number; envelope: number };
export function shineFalloffCols(rowWidth: number, falloffFraction?: number): number;
export function shineIntensityAt(col: number, width: number, position: number,
                                 envelope: number, falloffCols: number): number;
export function quantizeShine(intensity: number): number;
```

Semantics: `position` is the shine centre as a 0..1 fraction of the swept surface,
eased with `smoothstep` so it accelerates through the middle. `envelope =
sin(PI*u)` fades the band in and out so a repeating sweep doesn't stutter.
`shineIntensityAt` is a linear tent centred on `position * (width - 1)` with
half-width `falloffCols`, multiplied by the envelope. `quantizeShine` snaps to
1/24 steps to keep emitted ANSI small.

Two consumers: the working-indicator fading text, and the editor input block's
one-shot startup shine.

`src/index.ts` (+13) re-exports all ten symbols **except** `smoothstep` is included
and `BlockShineOptions` is **not** — see the gap in §4.1.2.

#### 4.1.2 `src/components/editor.ts` (+305) — the input box

New public type:

```ts
export interface BlockShineOptions {
  frames?: number;          // default 24; last step is fully faded
  intervalMs?: number;      // default 40 (24 × 40 = 960ms)
  falloffFraction?: number; // default SHINE_FALLOFF_FRACTION
  rowOffset?: number;       // extra phase per row → diagonal band; default 0
  background: (intensity: number) => string;  // ANSI bg prefix; background(0) MUST
                                              // return the resting fill
}
```

`EditorOptions` gained five fields:

```ts
prompt?: string;                                         // e.g. "›"
placeholder?: string;                                    // shown when empty
placeholderStyle?: (text: string, shine?: number) => string;  // NOTE new 2nd arg
blockFill?: (text: string) => string;                    // wrap each line in a bg fill
blockShine?: BlockShineOptions;                          // requires blockFill
rightHint?: () => string;                                // right-aligned, display-only
```

New public methods: `isBlockShining(): boolean`, `startBlockShine(): void`,
`stopBlockShine(): void`, and the public field
`onAutocompleteVisibilityChange?: (visible: boolean) => void` (also added to the
`EditorComponent` interface in `src/editor-component.ts`).

Mechanics worth preserving:

- `promptPrefix = \`${prompt} \`` (trailing space), `promptPrefixWidth =
  visibleWidth(promptPrefix)`; the prompt **consumes layout columns**, so
  `layoutWidth = max(1, contentWidth - promptPrefixWidth - (paddingX ? 0 : 1))`,
  and both the cursor slice and `layoutLine.cursorPos` shift by `promptPrefixWidth`.
  Mouse handling compensates: `promptOffset = promptPrefixWidth` when `event.y ===
  1 && scrollOffset === 0`, then `targetColumn = max(0, event.x - paddingX -
  promptOffset)`.
- The shine timer is **counter-driven, never wall-clock** (`shineFrame: number`,
  `-1` = idle), `setInterval` is `unref()`ed, and it stops itself at
  `shineFrame >= frames`. `handleInput()` kills the shine on the first keystroke.
- `applyShineBackground()` is a **no-op when idle**, guaranteeing the resting block
  is byte-identical to a plain `blockFill`. It re-emits ANSI codes verbatim via
  `extractAnsiCode`, walks graphemes tracking columns by `visibleWidth`, and only
  emits `background(level)` when the quantised level changes.
- Render geometry: top border row = 0, input lines = 1..n, bottom border = n+1,
  `rowCount = renderedVisibleLineCount + 2`.
- On a filled block the cursor reset is `\x1b[27m` (reverse-video off only) instead
  of `\x1b[0m`, so the block background survives under the cursor.
- `rightHint` is appended only when `contentWidth - lineVisibleWidth - hintWidth >=
  RIGHT_HINT_MIN_GAP` (2), is display-only, and is dropped when it would collide.
- Placeholder is shown only on a truly empty single-line editor; when idle
  `placeholderStyle(text)` is called **once** (pinned by tests), while shining it is
  called once per grapheme with that column's intensity.

**Removed in the same change (coupled to the keybinding move in §4.6):** the
`tui.input.tab` dispatch and the private `handleTabCompletion`,
`handleSlashCommandCompletion`, `forceFileAutocomplete`. Tab inside an open
autocomplete menu still accepts the highlighted item, but Tab on a closed menu no
longer opens one — because the app bound Tab to work-mode cycling.

**Known gap:** `BlockShineOptions` is not re-exported from `src/index.ts`, so
`coding-agent`'s `theme/input-shine.ts` must deep-import. Add
`type BlockShineOptions` to the `Editor` export line on the new fork.

#### 4.1.3 `src/components/loader.ts` (+21)

Widened for subclassing: `frames`, `currentFrame`, `messageColorFn` and
`updateDisplay()` become `protected`; new `protected getIndicatorText()` and
`protected renderMessage(message, _frameIndex)` which defaults to
`this.messageColorFn(message)`. The coding agent's `status-indicator.ts` overrides
`renderMessage` for the fading working text. `CancellableLoader` is unaffected.

#### 4.1.4 `src/components/select-list.ts` (+14)

`SelectListTheme` gains optional `primaryText?: (text: string) => string`;
`SelectListLayoutOptions` gains optional `selectedItemMarker?: string` (default two
spaces, replacing the hardcoded `"→ "`). Non-selected rows route their primary
column through `primaryText()`. Both fields optional, so upstream callers are
unaffected.

#### 4.1.5 Smaller library changes

| File | Change |
|---|---|
| `src/autocomplete.ts` (+4/−1) | slash-command item `label` becomes `` `/${name}` ``; `value`/`name` unchanged |
| `src/terminal.ts` | `PI_TUI_ESC_TIMEOUT` → `FLUX_TUI_ESC_TIMEOUT`, `PI_TUI_WRITE_LOG` → `FLUX_TUI_WRITE_LOG` |
| `src/terminal-image.ts` | `PI_HYPERLINKS`/`PI_IMAGE_PROTOCOL`/`PI_TRUE_COLOR` → `FLUX_*` |
| `src/tui-main-screen.ts` | `PI_TUI_DEBUG_REDRAW`/`PI_TUI_DEBUG` → `FLUX_*`; log files `pi-tui-debug.log`/`pi-tui-crash.log` → `flux-*` |
| `native/win32/build.mjs` | `PI_TUI_WIN32_TOOLCHAIN` → `FLUX_TUI_WIN32_TOOLCHAIN` |
| `package.json` | version `0.85.1` → `0.1.0` only |

Byte-identical to upstream: `keybindings.ts`, `keys.ts`, `utils.ts`, `tui.ts`,
`tui-alt-screen.ts`, and every `components/*` other than editor/loader/select-list.

#### 4.1.6 Tests

- `test/shine.test.ts` — NEW (+110): clamping, `smoothstep`, `shinePhase` endpoints
  (with a comment that `sin(PI)` is a hair above zero), falloff clamps including
  `NaN`/negative fraction, tent symmetry about the centre, degenerate guards,
  quantisation.
- `test/editor.test.ts` (+296): a `requestForceAutocomplete(editor)` cast helper
  (with a comment that Tab no longer opens the menu), rewritten autocomplete tests
  (type `@` first), new prompt/filled-block tests asserting exact byte layout, new
  `block shine` tests using `mock.timers` including "sweeps once and settles back",
  "does nothing without both options", "stops on the first keystroke", and
  "passes a per-grapheme intensity to `placeholderStyle`".
- Renamed-env updates in `terminal.test.ts`, `tui-render.test.ts`,
  `terminal-image.test.ts`, `native-platform.test.ts`.

### 4.2 Interactive mode (`packages/coding-agent/src/modes/interactive/`)

The largest single change: `interactive-mode.ts` alone is ~1360 changed lines.
Areas, per the fork's own record:

- **Startup rework.** The verbose `[Context]/[Skills]/[Prompts]/[Extensions]/
  [Themes]` listing never renders — `quietStartup` defaults to `true`, and the
  listing block plus five private helpers are **commented out in place** with
  `FLUX (commented out)` markers. Resource *diagnostics* (conflicts/errors) still
  render. Startup shows a bold blue `flux` wordmark + version, then two dim lines:
  `model: <id> <thinking-level>` (with a yellow `/model` hint) and
  `directory: <cwd>` (home shortened to `~`). Update-check is gated behind
  `APP_NAME === "pi"`, so it is dead on flux.
- **Status bar hiding.** The footer container is emptied while an autocomplete menu
  is visible, via `onAutocompleteVisibilityChange` (§4.1.2). Also hides for `@`/`#`
  completions.
- **Compact transcript.** Thinking hidden while the working indicator is active;
  streaming tool calls hidden until args complete, then shown as one-line summaries
  (`Reading file`, `Edited file`, `Ran npm run check`); errors always visible;
  expansion restores detail. Completed tool rows use a static white dot, **not** a
  check mark.
- **Working indicator.** A floating `•` breathing on the gray ramp (256-colour
  244→255), 24 frames @ 40 ms, raised-cosine, bright-biased; message
  `Working (Ns • esc to interrupt)` with a left→right white shine. Achieved with
  `embedWorkingStatus: false` so it floats in `statusContainer`; retry/compaction/
  branch-summary keep their spinners.
- **Attention bell.** Terminal bell when a run settles or an approval/question needs
  input. Default on; `terminal.attentionBell` in settings.
- **Agent tabs.** New `components/agent-tabs.ts` renders one line directly above the
  input, painted with `theme.bg("inputBg", …)`: a `Main (<session name>)` tab plus
  one per child agent. Selected tab is underlined (`\x1b[4m…\x1b[24m`), others
  `muted`; `‹`/`›` when tabs overflow; falls back to the selected label alone when
  even one tab won't fit. Visible chat is underlined; **Left/Right switch
  transcripts when the input is empty**; Escape interrupts the visible child
  without changing tabs. The tab row is hidden while a selector/extension dialog/
  overlay/slash-autocomplete replaces the chat editor.
- **`/agents` panel.** Child rows as `Title · elapsed · N tokens · task` (`✓` when
  completed), then a detail view with `Inspect`, `Send message`, `Stop`, `Back`.
- **Context warning.** `buildContextWarning()` is wired as the editor's `rightHint`,
  returning `theme.fg("warning", "NN% ctx")` once context usage crosses
  `getContextWarningPercent()`.

Per-file deltas in `src/modes/` (from `git diff --numstat 6160683a4 HEAD`):

| File | + | − |
|---|---|---|
| `interactive-mode.ts` | 968 | 392 |
| `components/tool-execution.ts` | 163 | 3 |
| `components/status-indicator.ts` | 85 | 2 |
| `components/assistant-message.ts` | 51 | 10 |
| `components/footer.ts` | 54 | 155 |
| `components/thinking-selector.ts` | 36 | 71 |
| `components/settings-selector.ts` | 36 | 8 |
| `components/model-selector.ts` | 29 | 74 |
| `components/session-selector.ts` | 22 | 20 |

#### 4.2.1 Footer (`components/footer.ts`, +54/−155) — a rewrite, not a tweak

`render()` is now:

1. `modeLabel = theme.getPermissionModeColor(mode)(\`${theme.getPermissionModeIcon(mode)} ${mode} mode\`)`
   — icons are plan `◇`, auto `▸`, manual `•`.
2. `modelPart = theme.fg("dim", state.model?.id || "no-model")`
3. `effortPart = state.model?.reasoning ? theme.getThinkingBorderColor(level)(level) : undefined`
   — this is the "effort label colored to match the effort bar" rule.
4. optional 4th part when a child tab is selected:
   `theme.fg("muted", \`${sanitizeTerminalLabel(title)} · ${formatAgentTokenVolume(snapshot)}\`)`
5. `mainLine = "  " + parts.join("   ")` (three spaces between segments), truncated
   to width.
6. If `footerData.getExtensionStatuses().size > 0`, an alphabetically sorted second
   line.

**Removed relative to upstream:** the pwd/git-branch/session-name line; the ↑/↓/R/W
token counters; the cache-hit `CH%`; the cost display; the entire context
percentage/context-window field including its `(auto)` suffix and warning/error
coloring; the experimental `xp` badge; the right-aligned `(provider) model •
thinkingLevel` side; all the `visibleWidth` padding/truncation logic; the
`addUsageToTotals`/`createUsageTotals` walk over session entries and the
`latestCacheHitRate` computation. `setAutoCompactEnabled()` became a **no-op**.

Constructor gained a third `requestRender?: () => void` arg; `invalidate()` now
actually requests a render; `dispose()` unsubscribes from the supervisor;
`setSelectedChild(id)` is new.

> **Correction, and a warning about the docs.** There is **no DeepSeek peak-rate
> indicator** at HEAD. `grep -ri peak` across all `src`/`test` finds only the shine
> constants and comments — nothing about rate windows, `deepseek.com` endpoints, or
> a red `peak` prefix. `flux.md:461` documents it as implemented (2026-09-11) and
> `FLUX_CHANGELOG.md` ships it as an Added entry, but it never landed. The
> flux.md "(2026-09-12)" "compact context field with a background split following
> usage" is likewise **not in the code** — the final footer has no context element at
> all. Do not re-implement these from that prose; see §8.

#### 4.2.2 Selector changes

| File | +/− | Change |
|---|---|---|
| `model-selector.ts` | 29/74 | **Search box removed entirely** (field, `getSearchInput()`, Enter-selects-first, `Input`/`DynamicBorder` imports, both borders, the "Only showing models from configured providers…" warning, the "Model catalogs refreshed." status, the selected-model name line). Added `MODEL_COLUMN_WIDTH = 46`, `query` (from `/model <query>` via `initialSearchInput`), `getSelectedModel()`. Header `Spacer(1)` → bold title → `Spacer(1)`. Rows: `marker = isSelected ? theme.fg("accent", "> ") : "  "`, id colored `accent`/`text`, label truncated to the fixed column then padded, right-hand description `accent`/`muted`. |
| `thinking-selector.ts` | 36/71 | Search box, fuzzy filter, `DynamicBorder`s and all hint lines removed; layout consts and descriptions moved to `thinking-levels.ts` / `model-description.ts`. New 7th ctor arg `modelLabel` → title `` `Select Reasoning Level for ${modelLabel}` ``. Rows `` `${i+1}. ${LABEL}${suffix}` `` with new `thinkingLevelSuffix()` → ` (default, current)` / ` (default)` / ` (current)`. `THINKING_SELECT_LIST_LAYOUT = { minPrimaryColumnWidth: 18, maxPrimaryColumnWidth: 32, selectedItemMarker: "> " }`; theme overrides `primaryText: (text) => text` to defeat the new bold default. |
| `settings-selector.ts` | 36/8 | Both `DynamicBorder`s removed (host owns the box). New `handleInput()`. New rows `context-warning` (values 70/75/80/85/90/95/off) and `attention-bell` (true/false) with their callbacks. |
| `session-selector.ts` | 22/20 | Borders removed; inputs become `new Input({ prompt: "  ", … })`; row cursor `› ` → `> `; selection cue becomes accent text with **no** `selectedBg` wrapper. |
| `scoped-models-selector.ts`, `trust-selector.ts` | 1/1 | `→ ` prefix removed (accent text only). |
| `oauth-selector.ts` | 1/2 | `→ ` prefix removed. |
| `extension-selector.ts` | 1/8 | Borders removed; selected row no longer prefixes `→ `. |
| `first-time-setup.ts` | 2/2 | `→ ` prefix removed; "bugs within Pi" → "bugs within Flux". |

Host plumbing in `interactive-mode.ts`: `showSelector`'s create callback gained
`{ boxed?: boolean; hint?: string }`. When `boxed`, the component is wrapped in
`new Box(2, 1, (text) => theme.bg("inputBg", text))`; when `hint`, a
`theme.fg("dim", "  " + hint)` line is appended below. All four call sites (settings,
effort, model, session) now pass `boxed: true`, three with keybind hints.

This partially contradicts `docs/menu-style.md`, which still lists
`trust-selector`/`oauth-selector`/`scoped-models-selector` as "legacy style" — they
lost their arrows but keep other legacy aspects. Update the doc on the new fork.

#### 4.2.3 New/changed components

- `components/status-indicator.ts` (+85/−2): new `createWorkingDotIndicator()` —
  24 frames of `\x1b[38;5;Nm•\x1b[39m` at 40 ms, grayscale indices 244–255, brightness
  `(0.5 + 0.5*cos(2πt))**0.6` (raised cosine, bright-biased). `WorkingStatusIndicator`
  gains `baseMessage`, `interruptHint`, `startedAt` and a 1 s interval producing
  `` `${baseMessage} (${seconds}s • <esc> to interrupt)` `` (shortens `escape` to
  `esc`). It overrides the new `Loader.renderMessage` to sweep a white→gray shine
  across the word using `shinePhase(frame / (frames.length - 1))`.
- `components/tool-execution.ts` (+163/−3): `ToolExecutionOptions.compact`. New
  `CompactToolLoader extends Loader` (drops its first rendered line),
  `STATIC_DOT = "•"`, and `formatCompactToolAction(toolName, args, cwd, finished,
  failed)` with per-tool past/present verbs (`Reading`/`Read`, `Editing`/`Edited`,
  `Running <cmd>`/`Ran <cmd>`, …) plus `summarizeCommand()` (splits on
  `|| && | ;`, ≤3 segments, 3 tokens for npm/pnpm/yarn/bun). Compact mode short-circuits
  `updateDisplay()` and shows `hidden`/`running`/`done` states. `compact: true` is
  passed at all three construction sites in `interactive-mode.ts`.
- `components/assistant-message.ts` (+51/−10): new `AssistantReplyComponent` prefixes
  the first line with `indent + "•" + " "` and hangs continuations at `indent + 2`.
  Hidden thinking now renders **nothing** rather than a "Thinking…" label
  (`defaultHiddenThinkingLabel` changed `"Thinking..."` → `""`), and
  `hasVisibleContent` excludes thinking when hidden.
- `components/custom-editor.ts` (+13): new `onAgentTabKey?: (data: string) => boolean`,
  consulted first in `handleInput()` when no autocomplete is open. It also now
  intercepts `tui.input.tab` **only while autocomplete is showing** (accept the
  completion), letting Tab fall through to the `app.permission.cycle` handler
  otherwise. This is the other half of the §4.1.2 Tab change.
- `components/worked-duration.ts` (new, +42): `formatWorkedDuration` →
  `Xs`/`Nm Ns`/`Nh Nm Ns` (min 1 s); `formatWorkedTokens` → `123`/`1.2k`/`1m`;
  `WorkedDurationComponent` (`ctor(durationMs: number, tokenCount: number)`,
  `invalidate()`, `render(width)`) renders one dim line
  `─ Worked for <duration> · <tokens> tokens ` padded with `─` to full width.
- `components/question-picker.ts` (new, +236): `QuestionPickerComponent extends
  Container implements Focusable`; ctor `(request, tui, keybindings, done)`. Question
  screen: `header  Question N of M`, prompt, numbered options with `(Recommended)`
  markers, selected row `> ` accent + `selectedBg` fill, muted descriptions, optional
  custom-answer block on `inputBg` with warning-colored errors; viewport clamped to
  `max(8, rows - 2)` with `↑ more`/`↓ more`. Review screen: `Review answers
  (n/total)`, each `header: value|"Unanswered"`, then a highlighted `Submit answers`.
  `\x1b` cancels with `{status:"cancelled", reason:"user"}`. Still on the legacy menu
  style (§4.3).
- `components/agent-tabs.ts` (new, +69): see §4.2. `maxLabelWidth = max(6, min(22,
  floor((width-4)/min(tabs,3)) - 2))`; window shrinks from the far side; degrades to a
  single truncated label. Titles are `sanitizeTerminalLabel`ed and truncated *before*
  ANSI re-wrapping so a reset cannot erase the row background.
- `model-description.ts` (new, +44): `formatModelDescription(model)` →
  `"<ctx> context · $<in>/$<out> per Mtok[ · reasoning]"`, or `"free"`.
- `thinking-levels.ts` (new, +28): `THINKING_LEVEL_LABELS` (`Off`, `Minimal`, `Low`,
  `Medium`, `High`, `Extra-high`, `Maximum`) and `THINKING_LEVEL_DESCRIPTIONS`.

#### 4.2.4 Other interactive-mode plumbing

- `showExtensionCustom` gained `signal?: AbortSignal` / `onAbort?: () => T`, so a
  picker can resolve on abort. `showQuestionPicker` uses it to return
  `{status:"cancelled", reason:"aborted"}`.
- `applyRuntimeSettings()` wires the host handlers:
  `session.setToolCallApprovalHandler((request, signal) => this.requestToolApproval(request, signal))`
  and `session.questionService.setHandler((request, signal) => this.showQuestionPicker(request, signal))`,
  and re-applies the local permission mode if the session's differs.
- `requestToolApproval()` rings the bell, formats
  `"<tool> requires approval\n<reason>\n\n<details>"` and shows an
  `["Allow once","Deny"]` selector, resolving `true` only for `Allow once`.
- `new` `permission_mode_changed` event case updates `this.permissionMode` and
  invalidates the footer. `handleBashCommand` calls
  `session.assertToolCallPermitted("bash", {command})`.
- Many `showStatus()` chatter calls were deleted (HTTP idle timeout, TUI mode,
  tool-output expansion, thinking visibility, model switch/selection, trust saved,
  model-selection saved, thinking level).
- `handleHotkeysCommand()` help table updated: Tab row `Accept autocomplete / cycle
  work mode`, plus rows for `app.permission.cycle` and `app.thinking.cycle`.
- `dispose()` unsubscribes the agent supervisor.
- `renderWidgets()` inserts `agentTabs` under the reserved key `"__flux_agent_tabs__"`
  when children exist, rendering below-widgets with `spacerWhenEmpty=false,
  leadingSpacer=false`.
- The startup listing is not deleted but **commented out in place** under
  `FLUX (commented out)` banners: the `showListing` flag is hard-coded `false`, and
  eleven helpers (`formatExtensionDisplayPath`, `formatContextPath`,
  `getCompactPathLabel`, `getCompactPackageSourceLabel`, `getCompactExtensionLabel`,
  `getCompactDisplayPathSegments`, `getCompactNonPackageExtensionLabel`,
  `getCompactExtensionLabels`, `getScopeGroup`, `buildScopeGroups`,
  `formatScopeGroups`) plus the `sectionHeader`/`formatCompactList`/`addLoadedSection`
  closures and the whole `if (showListing) {…}` block are commented out. Diagnostics
  still render.

#### 4.2.5 Work summary bar

`agent_start` (and `turn_start` if unset) records `workStartedAt`. On `agent_end`
the handler sums `usage.input+output+cacheRead+cacheWrite` over `event.messages` and,
if a start time existed, appends a `Spacer(1)` + `WorkedDurationComponent(Date.now() -
workStartedAt, tokenCount)` to the chat container.

### 4.3 Menu style — the normative spec

`packages/coding-agent/docs/menu-style.md` (+154, new) is the single most
copy-ready document in the repo. Its rules:

- **The gray box belongs to the host.** A menu returns plain content and
  `InteractiveMode.showSelector` wraps it when `boxed`:
  `new Box(2, 1, (text) => theme.bg("inputBg", text))`. The surface is a
  **background fill, never a border** — no `─` rules, no box-drawing, no
  `DynamicBorder`. Menus with a non-interactive host (`SessionSelectorComponent`
  under `--resume`) must not box themselves.
- **Layout skeleton:** `Spacer(1)` → `Text(theme.bold(title), 0, 0)` → `Spacer(1)` →
  optional scope/hint → `this.list` → `Spacer(1)`.
- **The chevron is ASCII `> `** — two cells, accent-coloured, at column 0 (so screen
  column 2 under `Box`). **Not `›` (U+203A) and not `❯`** — `›` is the legacy marker.
  Unselected rows emit two spaces so columns align: never one space, never nothing.
  Declarative via `SelectListLayoutOptions.selectedItemMarker`, or hand-rolled as
  `isSelected ? theme.fg("accent", "> ") : "  "`.
- **"The chevron must be the only `>` on screen."** `Input` defaults its prompt to
  `"> "`, so any text field inside a menu needs `new Input({ prompt: "  ", … })` —
  two spaces.
- **Selection has no background.** `selectedBg` must not appear in a menu; the
  accent chevron plus accent row text is the entire cue. Colour per piece from
  `isSelected` rather than composing and re-wrapping a styled line (re-wrapping
  nests ANSI and inner resets bleed through).
- **Hint line:** one dim line *below* the box, on the terminal background, indented
  two spaces, passed via the `hint` field. It is a static string resolved at mount,
  so anything state-dependent must live inside the box.
- **Tokens:** `inputBg` box surface (falls back to `selectedBg`), `accent` chevron +
  selected text, `text` primary unselected, `muted` secondary columns, `dim` hint
  line and key hints.
- **Reference implementations:** `model-selector.ts` (hand-rolled, fixed-width
  right-hand description column) and `thinking-selector.ts` (`SelectList` with
  `selectedItemMarker`). Test shape to copy: `model-selector.test.ts` asserts the
  accent chevron is present and the `selectedBg` escape is **absent**.
- **Still on the legacy style** (two styles coexist): `trust-selector.ts`,
  `oauth-selector.ts`, `tree-selector.ts`, `user-message-selector.ts`,
  `config-selector.ts`, `theme-selector.ts`, **`question-picker.ts`**,
  `scoped-models-selector.ts`. Caveat: this list is slightly stale — the fork
  partially migrated `trust-selector`, `oauth-selector` and `scoped-models-selector`
  (they lost their `→ ` prefixes and some borders, see §4.2.2) without updating this
  list. `question-picker.ts` is the significant one: the newest component does not
  follow the newest style guide.

Effort level display names: `Off`, `Minimal`, `Low`, `Medium`, `High`,
`Extra-high`, `Maximum`. Model rows use a fixed primary column (`N. <model id>`
with `(current)`/`(default)` suffixes) and a muted synthesised description (context
window, price, reasoning). Neither menu paints a background across the selected row
("a full-width `selectedBg` fill was tried and dropped as noise"). Both menus lost
their search boxes; `/model <query>` remains the prefilter path.

### 4.4 Input box and startup shine

`inputbox.md` (236 lines, fork-authored) is the precise spec.

- **Geometry:** 3 lines for single-line input — `[0]` fill padding, `[1]` `› <text>`,
  `[2]` fill padding. `›` on the first input line only. Empty input shows the muted
  placeholder, which is display-only and never submitted; the first placeholder
  grapheme renders under the reverse-video cursor. Without the block options the
  editor behaves exactly as before (borders, `─` lines).
- **Wiring:** `prompt: "›"`, `placeholder: "Ask flux anything"`,
  `placeholderStyle: (text) => theme.fg("muted", text)`,
  `blockFill: (text) => theme.bg("inputBg", text)`,
  `rightHint: () => this.buildContextWarning()`, `embedWorkingStatus: false`.
- **`buildContextWarning()`** returns `theme.fg("warning", "NN% ctx")` once
  `session.getContextUsage().percent` reaches
  `settingsManager.getContextWarningPercent()`.
- **Theme token:** `inputBg`, optional, falls back to `selectedBg`; dark `#3c3c3c`,
  light `#e7e7ea`.
- **`theme/input-shine.ts`** (new, +124) — the colours. Dark blends `inputBg`
  `#3c3c3c` → `#8e8e8e` at peak (`INPUT_SHINE_BG_PEAK = 0.42`); light blends toward
  `#3c3c3c`. Direction is chosen from `inputBg`'s own luminance, since blending a
  light fill toward white is invisible. The placeholder foreground brightens too
  (`INPUT_SHINE_FG_PEAK = 0.75`) because muted `#808080` on a lightened block is
  barely 1.2:1 contrast. Tuning guidance: *pulse not glint* → lower
  `falloffFraction` (0.18); *too strong* → lower `INPUT_SHINE_BG_PEAK`; *placeholder
  washes out* → raise `INPUT_SHINE_FG_PEAK`.
- **Max-effort variant:** the same glint recoloured to the effort colour when
  reasoning effort becomes `max`, blending toward `thinkingMax` (`#ff5f3c` dark /
  `#c2410c` light). Trigger `shouldPlayMaxShine(previous, next)` fires only on a real
  transition into `max`, from `cycleEffort()` (shift+tab) and `selectThinkingLevel()`
  (`/effort`, Enter and Ctrl+S); `next` is the post-clamp level, so picking `max` on
  a model that lacks it clamps to `high` and stays silent. The fg fade is
  deliberately shared with the neutral glint (blending toward `thinkingMax` would put
  red text on a red band). Non-hex / 256-index `thinkingMax` falls back to the
  neutral untinted glint, and a session that *starts* on `max` gets the plain gray
  launch glint.
- `Theme` gained `getRawColor`, `blendBgAnsi`, `blendFg`, and module-level
  `relativeLuminance`, falling back to the unblended colour for non-hex tokens.

### 4.5 Theme

`theme/dark.json` (+10/−8), `light.json` (+9/−8), `theme.ts` (+105/−10),
`theme-json.ts` (+4/−1), `theme-schema.json` (+13/−1).

Token-type additions: `ThemeColor += "blue" | "yellow"`, `ThemeBg += "inputBg"`.
Both are **optional** with fallbacks applied in `withThemeColorFallbacks()` and in
the `Theme` constructor: `blue ?? border`, `yellow ?? warning`, `inputBg ??
selectedBg`. Schema (`theme-json.ts`, `theme-schema.json`) updated to match;
registered in `createTheme`'s `bgColorKeys`.

New `Theme` API: private `fgRawColors`/`bgRawColors` maps,
`getRawColor(color)`, `blendBgAnsi(color, target, amount)` (falls back to
`getBgAnsi` for non-hex tokens or `amount <= 0`), `blendFg(color, target, amount,
text)` (resets only the foreground with `\x1b[39m`), `getPermissionModeColor(mode)`
(plan → `customMessageLabel`, auto → `thinkingXhigh`, else `muted`) and
`getPermissionModeIcon(mode)` (plan `◇`, auto `▸`, manual `•`). New exported
module-level `relativeLuminance(hex)` = `(0.299r + 0.587g + 0.114b)/255`, plus
private `isHexColor`/`mixHex`.

**Global restyle:** `getSelectListTheme()` now wraps `selectedPrefix`, `selectedText`
and `description` in `theme.bold(...)` and adds `primaryText: (text) =>
theme.bold(text)`. `getSettingsListTheme()` bolds `label`/`value`/`description`/`hint`
and changes its cursor from `theme.fg("accent", "→ ")` to `"  "` — this affects
**every** `SettingsList` user, not just the new menus.

Colour changes:

| Token | dark | light |
|---|---|---|
| `accent` var | `#8abeb7` removed → uses `blue` | `teal #5a8080` removed → uses `blue` |
| `borderAccent` | — | `teal` → `blue` |
| `mdCode`, `mdListBullet` | `accent` → `blue` | `teal` → `blue` |
| `yellow` | added `#d7af5f` (literal; the `warning` path still uses var `#ffff00`) | — |
| `inputBg` | added `#3c3c3c` | added `#e7e7ea` |
| `thinkingMedium` | `#81a2be` → `#6fa8dc` | `teal` → `#6fa8dc` |
| `thinkingHigh` | `#b294bb` → `#4d9fff` | `#875f87` → `#2f7fd6` |
| `thinkingXhigh` | `#d183e8` → `#ffa63f` | `#8b008b` → `#d97706` |
| `thinkingMax` | `#ff5fff` → `#ff5f3c` | `#af005f` → `#c2410c` |

Net effect: muted teal → blue; menus bold; the effort ramp reads
gray → dim blue → bright blue → fiery red-orange.

`themes.md` documents `inputBg`, but its own arithmetic is now inconsistent — the
heading was updated to "11 required, 3 optional" while the total still reads 53.

### 4.6 Keybindings

`core/keybindings.ts` (+18) — new ids and defaults:

| id | default | description |
|---|---|---|
| `app.permission.cycle` | `tab` | Cycle work mode |
| `app.thinking.cycle` | `shift+tab` | Cycle reasoning effort (was "Cycle thinking level") |
| `app.question.back` | `left` | Question picker: go back |
| `app.question.forward` | `right` | Question picker: go forward |
| `app.question.review` | `ctrl+r` | Question picker: review answers |
| `app.agent.tabPrevious` | `left` | Show previous agent tab when input is empty |
| `app.agent.tabNext` | `right` | Show next agent tab when input is empty |

Migration map gains `cyclePermissionMode → app.permission.cycle`. `/mode` was
renamed to `/work-mode`; `/thinking` was renamed to `/effort`. The `tui.input.tab`
binding still exists upstream-side but its editor dispatch was deleted (§4.1.2),
because Tab is now `app.permission.cycle`; `custom-editor.ts` re-adds Tab handling
only while an autocomplete menu is showing (§4.2.3).

Two notes for a clean fork:

- `app.question.back/forward` and `app.agent.tabPrevious/Next` **share `left`/`right`**.
  They are context-disjoint (the picker is modal) but nothing in the binding table
  expresses that, so it is easy to break.
- Mode cycling order is `plan → auto → manual`. Interactive sessions default to
  **manual** mode; print/CLI sessions stay `auto` and there is no CLI flag for it.

---

## 5. Core features

### 5.1 Structured question service (+ interactive picker)

Files: `core/question-service.ts` (new, 346), `core/question-picker-state.ts`
(new, 165), `core/tools/ask-user.ts` (new, 65),
`core/tools/renderers/ask-user.ts` (new), `modes/interactive/components/question-picker.ts`
(new, 236).

Exported contract:

```ts
export const QUESTION_CUSTOM_OPTION_ID = "__custom__";
export const QUESTION_CUSTOM_OPTION_LABEL = "Write my own answer";
export const QUESTION_LIMITS = {
  maxQuestions: 5, minOptions: 2, maxOptions: 3,
  maxIdLength: 64, maxHeaderLength: 80, maxPromptLength: 1000,
  maxOptionLabelLength: 120, maxOptionDescriptionLength: 300,
  maxCustomAnswerLength: 4000,
} as const;

export interface QuestionOption { id: string; label: string; description: string; recommended?: boolean }
export interface Question { id: string; header: string; prompt: string; options: QuestionOption[] }
export interface AskUserInput { questions: Question[] }
export interface QuestionRequest extends AskUserInput { requestId: string }
export interface QuestionAnswer { optionId?: string; customText?: string; label: string }

export type AskUserResponse =
  | { status: "submitted"; answers: Record<string, QuestionAnswer> }
  | { status: "cancelled"; reason?: "user" | "aborted" | "interrupted" }
  | { status: "unavailable"; reason: "no_handler" | "handler_error" | "invalid_response"; message: string };

export type QuestionHandler =
  (request: QuestionRequest, signal: AbortSignal) => AskUserResponse | Promise<AskUserResponse>;
```

`class QuestionService` — `ask(input, signal?)`, `respond(requestId, response): boolean`,
`cancelAll(reason)`, `setHandler(handler)`. Request ids are
`question_${++nextRequestId}`. **One active question at a time**, extras queue FIFO.
`respond` returns `false` for stale/duplicate ids. No handler →
immediate `unavailable/no_handler` so print mode cannot hang. Setting the handler to
`undefined` calls `cancelAll("unavailable")`. Responses are validated by
`validateAskUserResponse` before being returned; invalid ones become
`unavailable/invalid_response`. `addCustomOptions` appends the reserved
`__custom__` option to every question before dispatch, so hosts always see it.
Rejected inputs: `__custom__` supplied by the model, more than one `recommended`
per question, duplicate question/option ids.

Persistence: `ask_user_request` and `ask_user_response` custom session entries.
`findUnfinishedQuestionRequests(entries)` finds dangling requests and the session
immediately appends `{status:"cancelled", reason:"interrupted"}` for each.

`ask_user` tool: `executionMode: "sequential"`; description *"Ask the user one to
five structured questions. Each question must have two or three options; a custom
answer is added automatically."*; two guidelines (only for consequential ambiguity
or meaningful preference after inspecting the facts; don't ask the user to locate
facts in the repo or reconfirm explicit instructions). Returns
`[{type:"text", text: JSON.stringify(response)}]`.

It is added to the **default active tool names**:
`["read","bash","edit","write","ask_user"]` in both `core/sdk.ts` and
`core/agent-session.ts`. This is an observable change for SDK consumers.

Picker state machine (`QuestionPickerState`): `question` → `review` screens,
`moveOption`/`moveReview`/`goBack`/`goForward`/`confirm`/`submitCustomText`,
returning `QuestionPickerTransition` values (`none`, `custom-input`, `review`,
`edit`, `submitted`, `invalid`). Empty custom answers are rejected with
`"Custom answers cannot be empty."`; re-entering the custom option restores
previously typed text.

### 5.2 Agent supervisor + chat tabs

Files: `core/agent-supervisor.ts` (new, **649**), `core/tools/agent-supervisor.ts`
(new, 109), `modes/interactive/components/agent-tabs.ts` (new, 69).

Read-only child agents in their own `AgentSession` (own transcript, own token
budget), queued with a concurrency cap, persisted in the parent session, streamed to
the UI as snapshots, with optional parent auto-resume.

```ts
export const AGENT_CHILD_ENTRY_TYPE = "agent_child";
export const AGENT_CHILD_RESULT_LIMIT = 8000;
export const AGENT_CHILD_CONCURRENCY_LIMIT = 2;
export const AGENT_CHILD_LIMIT = 5;
export const READ_ONLY_CHILD_TOOLS = ["read", "grep", "find", "ls"] as const;

export class AgentSupervisor {
  readonly parentSession: AgentSession
  subscribe(listener): () => void
  spawnAgent(request: AgentChildRequest): string          // synchronous, returns id
  getAgentStatus(id?): AgentChildSnapshot[]
  getAgentSession(id): AgentSession | undefined
  waitAgents(options?: WaitAgentsOptions): Promise<AgentChildSnapshot[]>
  sendAgentMessage(id, message): Promise<void>
  stopAgent(id, status?): Promise<AgentChildSnapshot>
  stopAll(status?): Promise<void>
  dispose(): Promise<void>
}
```

Key mechanics:

- Construction calls `this.parentSession.attachAgentSupervisor(this)`, which
  registers the four tool definitions and refreshes the tool registry.
- `spawnAgent` validation (all `AgentSupervisorError`): at most 5 children per
  session; `task` non-empty ≤4000; **`name` must match `/^[A-Za-z]{1,5}$/u`** and be
  unique case-insensitively; `contextBrief` ≤4000; `expectedOutput` ≤1000;
  `paths.length` ≤32; `thinkingLevel` in
  `{off, minimal, low, medium, high, xhigh}`; model resolvable (defaults to the
  parent's). Id is `agent-${uuid.slice(0,12)}`.
- Children get `READ_ONLY_CHILD_TOOLS.filter(name => parentActiveToolNames.has(name))`
  and are created with `permissionMode: "plan"` — the read-only constraint is
  **structural**, not prompt-only.
- Child prompt ends with the hard directive: *"Use only read, grep, find, and ls. Do
  not edit files, run shell commands, delegate, or open a user interface."*
- `restore()` replays `agent_child` entries, keeps the latest per id, ignores records
  whose `parentId` differs, and rewrites non-terminal records to `interrupted`.
- Parent resume: only for terminal `completed`/`failed` and only when
  `resumeParentOnChildCompletion`; a 50 ms unref'd timer then
  `parentSession.sendCustomMessage({customType: "agent_updates", …, display: false},
  {triggerTurn: true})`.
- `AgentSession.abort()` calls `questionService.cancelAll("aborted")` and
  `await agentSupervisor.stopAll("interrupted")`; `dispose()` likewise.
- `main.ts:830` constructs it once per session with
  `resumeParentOnChildCompletion: true`.

Four tools, in asserted order: `spawn_agent`, `wait_agents`, `send_agent_message`,
`stop_agent`.

### 5.3 Permission modes

Files: `core/permission-mode.ts` (new, 204), plus gates in `agent-session.ts`.

```ts
export type PermissionMode = "auto" | "manual" | "plan";
export type ToolRisk = "safe" | "mutating" | "dangerous";
export interface ToolCallApprovalRequest {
  toolName: string; args: unknown; risk: Exclude<ToolRisk, "safe">; reason: string;
}
export type ToolCallApprovalHandler =
  (request: ToolCallApprovalRequest, signal?: AbortSignal) => Promise<boolean>;
export const PLAN_MODE_SYSTEM_PROMPT: string;
export const PLAN_MODE_TOOL_NAMES = ["read","grep","find","ls","ask_user"] as const;
export function isPlanModeToolAllowed(toolName: string): boolean;
export function classifyToolCall(toolName: string, args: unknown): { risk: ToolRisk; reason: string };
export function formatToolCallForApproval(toolName: string, args: unknown): string;
```

- `auto` — no gating (SDK/headless default).
- `manual` — every non-`safe` call goes to the `ToolCallApprovalHandler` before it
  runs (interactive default). Manual mode also **serialises tool execution**:
  `agent.toolExecution` is forced to `"sequential"` and restored on exit.
- `plan` — the tool set is physically reduced to `PLAN_MODE_TOOL_NAMES`, the plan
  prompt is appended to the system prompt, and other calls are blocked before
  extensions run. `setPermissionMode("plan")` snapshots
  `_toolsBeforePlanMode = getActiveToolNames()`; leaving restores it exactly, with
  allow/deny lists preserved. Plan mode also keeps `ask_user`.

`classifyToolCall`: `read`/`grep`/`find`/`ls`/`ask_user` are `safe`; `edit` is
`mutating`; `write` is `dangerous`; `bash`/`powershell` are `safe` only if the
read-only shell allowlist accepts the command, else `dangerous`; unknown/custom
tools are `dangerous`.

Hook order in `_installAgentToolHooks` → `beforeToolCall`, which matters:
1. plan gate (`block: "Tool execution is unavailable in plan mode"`)
2. manual approval gate (`"Tool call requires approval, but no approval handler is
   available"` when no handler; `"Tool call denied by user"` on `false`)
3. extension `tool_call` handlers

`assertToolCallPermitted(toolName, args)` throws
`` `Tool ${toolName} is unavailable in plan mode` `` and guards direct entry points
that bypass agent-core hooks: `executeBash(...)` and the RPC `bash` handler.

#### 5.3.1 RPC restriction

Only `auto` and `plan` are settable over RPC; `manual` is rejected:

```ts
export const RPC_SETTABLE_PERMISSION_MODES = ["auto", "plan"] as const;
export function isRpcSettablePermissionMode(mode: PermissionMode): mode is RpcSettablePermissionMode {
  return mode !== "manual";
}
```

Error text: *"Manual permission mode requires an interactive approval handler, which
RPC does not provide. Use auto or plan."* Rationale: manual gates every mutating
tool behind a `ToolCallApprovalHandler`, the protocol has no approval
request/response pair, and nothing in RPC mode ever calls
`setToolCallApprovalHandler` (only `interactive-mode.ts` does) — so accepting it
would dead-end every mutating tool.

Note the check only tests `!== "manual"`, so an unrecognised mode string passes the
guard and reaches `session.setPermissionMode(...)` unvalidated. Worth tightening.

#### 5.3.2 Read-only shell allowlist (security fix)

`637044014` replaced a prefix-regex allowlist with a command allowlist plus
explicit argument guards, closing these bypasses:

- `env rm -rf dist` (env runs its arguments)
- `find . -exec rm -rf {} +` and `find . -delete`
- `git branch -D main` (an optional `--show-current` group matched empty)
- `sed -n '1e ...'` and `awk -f script` (script files)

Algorithm: first reject anything containing shell metacharacters —
`/[;&|><`\n\r]|\$\(|\$\{|\(.*\)/` — so the string inspected is the string that runs.
Then:

- `git` → subcommand must be in `{branch, diff, log, ls-files, show, status}`;
  `-o`/`--output`/`--output=` rejected for every subcommand; `branch` additionally
  requires **every** arg to be in `{-a,-l,-r,-v,-vv,--all,--list,--remotes,
  --show-current,--verbose}`.
- `find` → unsafe if any arg matches
  `/^-(?:exec|execdir|ok|okdir|delete|fls|fprint|fprint0|fprintf)$/`.
- `rg` → unsafe if any arg is `--pre` or starts with `--pre=`.
- `sort` → unsafe with an output-file option.
- otherwise the base must be in:
  `bat, cat, date, df, du, eza, file, grep, head, id, ls, printenv, ps, pwd, rg,
  stat, tail, type, uname, uptime, wc, whereis, which, whoami`.
- Deliberately excluded and documented: `env`, `sed`, `awk`, `tree`, `uniq`, plus
  anything unlisted.

Design is allowlist-based, so unknown commands/subcommands/flags fall through to
manual approval.

### 5.4 Session, settings, prompt plumbing

- `agent-session.ts` (+230): new fields `_permissionMode`, `_toolsBeforePlanMode`,
  `_toolCallApprovalHandler`, `_toolExecutionBeforeManual`, `_agentSupervisor`,
  `readonly questionService`; new config `permissionMode?`, `questionHandler?`,
  `questionService?`; new methods `attachAgentSupervisor`, `attachAgentSupervisor`
  single-instance invariant, `setToolCallApprovalHandler`, `setPermissionMode`,
  `assertToolCallPermitted`, `private getEffectiveSystemPrompt(basePrompt)`
  (appends the plan prompt everywhere the system prompt can be reset).
- New event `{ type: "permission_mode_changed"; mode }`.
- `settings-manager.ts`: new `terminal.attentionBell` (default true, getter/setter)
  and `contextWarningPercent` (default 85, clamped `max(0, min(99, floor(p)))`).
  **Default flips:** `getHideThinkingBlock()` → `?? true`,
  `getQuietStartup()` → `?? true`.
- `system-prompt.ts` interpolates `APP_NAME` into every former "pi" occurrence.
- `slash-commands.ts`: `+work-mode` (`<auto|manual|plan>`), `+agents`; `thinking`
  **renamed** to `effort` (`/thinking` no longer exists).
- `config.ts`: `APP_NAME = piConfigName || "flux"`, `APP_TITLE = APP_NAME` (was
  `"π"`), `CONFIG_DIR_NAME` default `".flux"`, `getChangelogPath()` resolves
  `FLUX_CHANGELOG.md`.
- `main.ts:830` constructs the supervisor.
- No CLI flag exists for work mode — print/CLI sessions stay `auto`; interactive
  sets `manual` itself.

---

## 6. RPC and SDK surface

Protocol additions (`modes/rpc/rpc-types.ts`, `rpc-mode.ts`, `rpc-client.ts`):

```ts
// new commands (stdin)
| { id?: string; type: "get_state" }
| { id?: string; type: "set_permission_mode"; mode: PermissionMode }
| { id?: string; type: "set_question_handler"; enabled: boolean }

// new responses (stdout)
| { command: "set_permission_mode"; success: true; data: { mode: PermissionMode } }
| { command: "set_question_handler"; success: true; data: { enabled: boolean } }

// question pair
export type RpcQuestionRequest  = { type: "question_request";  requestId: string; questions: QuestionRequest["questions"] };
export type RpcQuestionResponse = { type: "question_response"; requestId: string; response: AskUserResponse };
export type RpcQuestionResponseResult = { type: "question_response_result"; requestId: string; accepted: boolean };
export type RpcInput = RpcCommand | RpcExtensionUIResponse | RpcQuestionResponse;
```

- `RpcSessionState` gains a **required** `permissionMode: PermissionMode`, reported
  by `get_state`.
- Server: `let questionHandlerEnabled = false` (default **off**, so `ask_user` over
  RPC returns `unavailable/no_handler` until a host opts in); `rpcQuestionHandler`
  emits `question_request` and settles **only on abort** — the real answer arrives
  out-of-band via the new `question_response` stdin branch, which always acks with
  `question_response_result` (including `accepted: false` for stale ids) and
  bypasses the id-correlated response machinery. `rebindSession()` re-registers the
  handler on every session swap. RPC `bash` gained
  `session.assertToolCallPermitted("bash", {command})`.
- Client: `RpcClientOptions.questionHandler?`,
  `export type RpcQuestionHandler = (request: QuestionRequest) => AskUserResponse | Promise<AskUserResponse>`,
  plus `setPermissionMode(mode: RpcSettablePermissionMode)`,
  `setQuestionHandler(handler?)`, `respondToQuestion(requestId, response)`.
  `start()` auto-registers the handler when the option was supplied.
  `handleLine` intercepts `question_request` **before** the generic event path, so
  listeners never see it.
- `private getWritableStdin()` was extracted out of `send()`.

**Breaking for existing hosts:**
1. `RpcSessionState.permissionMode` is required (TS break; runtime break for hosts
   validating `get_state` against a closed schema).
2. `start()` now emits an extra `set_question_handler` line when a handler option is
   present.
3. `question_request` is consumed by the client, not forwarded to listeners.
4. `question_response_result` **is** forwarded as an unknown event type — hosts with
   exhaustive `switch (event.type)` + `never` assertion will fail.
5. After switching to `plan`, previously-working `bash` over RPC fails with
   `"Tool bash is unavailable in plan mode"`.
6. `setPermissionMode` accepts the narrowed type — source-incompatible for callers
   passing a `PermissionMode` variable.
7. `ask_user` is now a default-active built-in tool (a fifth tool appears in the
   system prompt).

**Not re-exported** from `src/index.ts` / `core/index.ts` / `modes/index.ts`:
`RPC_SETTABLE_PERMISSION_MODES`, `RpcSettablePermissionMode`,
`isRpcSettablePermissionMode`, `RpcInput`, and `BlockShineOptions` (§4.1.2) — all
reachable only by deep import. Fix on the new fork.

**Undocumented:** `docs/rpc.md` and `docs/sdk.md` are untouched by the fork — none
of the above appears in either. There is **no protocol version field** anywhere, so
hosts must feature-detect by sending a command and inspecting `success/error`.

SDK: `CreateAgentSessionOptions` gains `questionHandler?`, `questionService?`,
`permissionMode?` (default `auto`); `defaultActiveToolNames` gains `ask_user`.
`package.json` `exports` map unchanged.

---

## 7. Deletions

- **All 10 `.github/workflows/*.yml`** deleted (~2000 lines): `approve-contributor`,
  `build-binaries`, `ci`, `issue-analysis`, `issue-gate`, `issue-triage-labels`,
  `npm-audit`, `pr-gate`, `publish-model-catalog`, `remove-inprogress-on-close`.
  The fork has **no CI**. Note this makes several upstream `AGENTS.md` sections
  describe a pipeline that no longer exists.
- The commit titled "remove workflows" refers to **GitHub Actions**, not a product
  feature — no product workflow feature was removed.
- Startup resource listing: not deleted, but **commented out in place** with
  `FLUX (commented out)` markers in `interactive-mode.ts`. This is a wart; a clean
  fork should delete it or gate it properly.

---

## 8. Bugs, leftovers, and things not to carry over

Verified in the current tree:

1. **`src/utils/version-check.ts:6`** — renamed to `getLatestFluxRelease()` but
   `LATEST_VERSION_URL` still fetches `https://pi.dev/api/latest-version` and
   compares it against flux's `0.1.0`, so any flux build would report a bogus
   update. The boot-time check is dead on flux (`APP_NAME === "pi"` gate), but the
   mismatch is a landmine.
2. **`packages/ai/scripts/generate-models.ts`** — patched a models.dev key
   `kimi-for-coding` → `kimi-code-plan-global`. A per-machine workaround baked into
   the generator; a fresh checkout on newer upstream data will need its own fix.
   (Also: the generated `data/` is gitignored, so a fresh clone does not boot
   without `npm --prefix packages/ai run generate-models`.)
3. **`DEFAULT_RADIUS_GATEWAY`** still points at `radius.pi.dev` while tests were
   briefly rewritten to expect `radius.flux.dev` — the fix reverted the test to the
   real endpoint rather than renaming the constant.
4. **`packages/coding-agent/dbg-ms.txt`** — untracked debug dump (1501 bytes, mtime
   2026-09-21 21:00): a JSON array of a rendered model-selector screen
   (`"Select Model and Effort"`, rows `claude-fable-5` … `claude-opus-4-8`,
   `"  (1/19)"`, `"  Refreshing model catalogs…"`). Scratch output from the
   selector work. Delete before publishing.
5. **The docs claim features the code does not have** (highest-value finding here).
   `flux.md:461` documents a "DeepSeek peak-rate warning in the footer (2026-09-11)"
   with a full What/Why, and `FLUX_CHANGELOG.md` ships it as an Added bullet — but
   `grep -ri peak` over every `src`/`test` finds only the shine constants. It never
   landed, or was dropped before commit. The same file's (2026-09-12) "compact
   context field with a background split following usage" is also absent: the footer
   has no context element at all. **Do not re-implement from that prose.** The
   `Implemented customizations` log mixes real spec with never-shipped intent.
6. **`FLUX_CHANGELOG.md` is stale.** It is the shipped changelog (`/changelog` reads
   it) but is missing every feature added after 2026-09-11 — permission modes, work
   modes, questions, sub-agents, the attention bell, `contextWarningPercent`, the
   input box redesign. `flux.md` is the de-facto changelog. Pick one authority.
7. **`packages/coding-agent/README.md` self-contradicts**: line 17 and the
   Philosophy section (lines ~501–507) still say "skips features like sub agents and
   plan mode", "**No sub-agents.**", "**No permission popups.**", "**No plan
   mode.**" — all now false. Its "interface from top to bottom" (lines ~151–156)
   describes the *upstream* TUI. Same problem in `docs/usage.md` §Design Principles.
8. **Stale identifiers in docs:** `ask_question` (wrong; the tool is `ask_user`) in
   `docs/sdk.md:552`, `docs/usage.md:303`, `packages/coding-agent/README.md:665`.
   `PI_*` env vars survive in `docs/extensions.md:2166`,
   `docs/terminal-setup.md:11-13,96,190`, `docs/tui.md:57`, `docs/providers.md:141`,
   `docs/sdk.md:414`, `AGENTS.md:85,192,193`, root `README.md:83`
   (`PI_ALLOW_LOCKFILE_CHANGE`). `pi-test.sh` is still the script name in root
   `README.md`, `docs/development.md`, and `AGENTS.md`.
9. **`question-picker.ts` is on the legacy menu style** — the newest flux UI
   component does not follow flux's own newest style guide (§4.3). Conversely
   `menu-style.md` still lists `trust-selector`/`oauth-selector`/
   `scoped-models-selector` as unmigrated although they lost their `→` arrows (§4.2.2).
10. **Personal/environment leaks to strip:** `/Users/leo/dev/flux` in `flux.md:25`
    and `inputbox.md:231`; `~/dev/flux` and `~/.local/bin/flux` in `AGENTS.md`;
    origin `hyzek/pi` in `flux.md` and `AGENTS.md`.
11. **`themes.md` arithmetic** is inconsistent (heading says 11 required + 3
    optional; the total still reads 53).
12. **`flux.md` contains its own retraction:** the 2026-09-15 entry says Shift-Tab
    cycles modes in the order "plan, auto, manual" and is superseded by the
    2026-09-21 entry (Tab cycles modes; Shift-Tab cycles effort). Anything before
    2026-09-21 in that log gives wrong keybindings. The 2026-09-12 entry also says
    `/mode`, later renamed `/work-mode`. **Treat the `Implemented customizations` log
    as history, not spec.**
13. **`RpcInput` is declared but never imported.** Dead type.
14. **`isRpcSettablePermissionMode`** only checks `!== "manual"`, so garbage mode
    strings reach `setPermissionMode` unvalidated.
15. **The release/binary path is still `pi`-shaped.** `scripts/build-binaries.sh`
    was **not changed at all** — it compiles `./dist/bun/cli.js` to `pi` / `pi.exe`,
    archives `pi-$platform.tar.gz` / `.zip`, and prints `pi` paths; `scripts/
    local-release.mjs:177,178,181` writes `pi.cmd` / `pi.ps1` and symlinks
    `node_modules/.bin/pi`. Neither matches the renamed `flux` bin. Separately, a
    **silent regression**: `scripts/coding-agent-consumer.mjs:116` iterates
    `new Set([manifest.bin.pi, "dist/cli.js"])` — `manifest.bin.pi` is now
    `undefined`, so the smoke test only exercises `dist/cli.js` and loses coverage
    without failing.
16. **The repo-root `.pi/` dev config dir is orphaned.** `CONFIG_DIR_NAME` is now
    `.flux` and **no `.flux/` directory exists**, so the prompts, skills, and
    extensions under `.pi/` (including `.pi/extensions/import-repro.ts`, which
    points at the deleted `.github/workflows/issue-analysis.yml`) silently stop
    loading for development. Rename to `.flux/` — and note `Fork-V2` already has
    the correct `configDir`, so this is a working-tree concern, not a port item.
17. **Lockfiles — regenerate before any publish or install path.** Upstream's shape
    is inherited, not introduced: at `6160683a4`, `npm-shrinkwrap.json` already
    resolves the internal `@earendil-works/pi-*` packages to
    `registry.npmjs.org/...tar.gz` with **no `integrity`** field while every
    third-party dep has one. What the fork changes is the *version*: those pins now
    read `0.1.0`, so `packages/coding-agent/npm-shrinkwrap.json` and
    `packages/coding-agent/install-lock/package-lock.json` point at tarballs that
    are **not flux artifacts**. Root `package-lock.json` is safe (workspace entries
    kept `link: true`). `install-lock/package.json` still describes itself as
    "Lockfile root used by the Pi installer and updater."
18. **Three example-extension lockfiles are out of sync** at `0.85.1` while their
    manifests are `0.1.0`: `examples/extensions/{custom-provider-anthropic,
    gondolin,with-deps}/package-lock.json`. (`sandbox/` is `1.15.1` and unrelated.)
19. **`flux.md:699-700` states a false resolution.** Open decision #4 is struck
    through with "Resolved: … The old prefix is no longer read or exported." It is
    still read: `packages/evals/src/pi-harness.ts:50,52,53,55` (`PI_PROVIDER`,
    `PI_MODEL`), `packages/evals/src/smoke.eval.ts:13,14`, and
    `packages/evals/src/vitest-evals/artifacts.ts:13`
    (`PI_SESSION_SNAPSHOT_ARTIFACT`). `scripts/check-lockfile-commit.mjs:5` reads
    `PI_ALLOW_LOCKFILE_CHANGE`, which `AGENTS.md:85,192,193` still documents — that
    one is at least *self-consistent*, so it works; it is just unrebranded.
20. **Theme `$schema` points at a schema that no longer matches.** `theme/dark.json:2`
    and `light.json` declare
    `raw.githubusercontent.com/earendil-works/pi/main/.../theme-schema.json`, while
    flux's theme files use `blue`, `yellow`, and `inputBg` — keys upstream's schema
    does not define. Editor validation is against the wrong schema.
    `theme-schema.json`'s title/description still read "Pi Coding Agent Theme".
21. **`AGENTS.md` contains three instructions that are now wrong**: `:139`
    `tmux send-keys -t pi-test "./pi-test.sh"` (only `tasks/flux-test.sh` exists),
    `:199` describes the `build-binaries.yml` release pipeline that was deleted, and
    `:22-23` claims the `piConfig` block sets "`flux` bin + **`pi` dev alias**" — the
    `pi` alias was removed in `fe435726a`; `bin` is `flux` only.
22. **Remaining untouched branding**: root `package.json` is unchanged
    (`name: "pi-monorepo"`, `version: "0.0.3"`, all `check:*`/`release:*` scripts);
    `CONTRIBUTING.md` and `SECURITY.md` have **zero diff** and still say "Pi"; and
    `src/core/export-html/template.js` keeps `pi-url-params`, `pi-share-base-url`,
    `pi-share:v1:sidebar-width`. One trap for the port: `test/utilities.ts:115`
    exports `FLUX_AGENT_DIR = ~/.flux/agent`, which is **not** an env var and is
    easily confused with `FLUX_CODING_AGENT_DIR`.
23. **The update/telemetry cluster is dead but still wired to upstream's servers.**
    In `interactive-mode.ts`, `reportInstallTelemetry` (line 1316) opens with
    `if (APP_NAME === "flux") { return; }` — so install telemetry never fires on
    flux, and the `fetch` to `https://pi.dev/api/report-install` below it (line
    1329) is unreachable. Same shape as item 1: the guard is what makes it safe.
    `showNewVersionNotification` (line 4719) has **zero callers**.
    `getLatestFluxVersion` / `checkForNewFluxVersion` / `getLatestFluxRelease` are
    likewise uncalled. A clean fork should delete this cluster outright rather than
    carry guarded-off code that points at `pi.dev`.
24. **Five remote endpoints still point at upstream.** `config.ts:515`
    `DEFAULT_SHARE_VIEWER_URL = "https://pi.dev/session/"`;
    `package-manager-cli.ts:50` `DEFAULT_INSTALLER_API_BASE =
    "https://pi.dev/api/installer/releases"`; `utils/changelog.ts:11`
    `GITHUB_REPO = "earendil-works/pi"` (so `/changelog` links to upstream's
    releases); the version-check URL and `radius.pi.dev` in item 3; and
    `scripts/release-notes.mjs:8`'s `DEFAULT_REPO`. Repointing these at a fork that
    does not exist yet is the actual dependency — see §10.3.

---

## 9. Docs inventory (what to carry, what to bin)

| File | Provenance | Verdict |
|---|---|---|
| `packages/coding-agent/docs/menu-style.md` (+154) | fork | **Carry nearly verbatim.** Best-designed doc here. Resolve the `›`-vs-`>` note. |
| `harness-plan.md` (240) | fork | **Carry and keep updating.** Only doc with explicit open product questions. Strip the "Existing foundations" framing of upstream example extensions as the baseline. |
| `inputbox.md` (236) | fork | **Carry, rewrite to present tense.** Drop the branch framing ("Everything below is on branch `openai-alike`"), line-number refs, and the personal path. Move "Possible follow-up work" to a backlog. |
| `flux.md` (716) | fork | **Split three ways.** ~430 of 716 lines are dated changelog entries, several superseded. Split into a short charter (Purpose, non-goals, open milestones, open decisions), `docs/` pages for the TUI/theme/permission-mode/work-mode/question specs, and an archive `flux-history.md`. |
| `FLUX_CHANGELOG.md` (15) | fork | Carry; required by the build. Must be brought current. |
| `AGENTS.md` (+36) | fork | Carry; parameterise the checkout path and origin. Keep the behavioural rules (quiet startup default, don't re-enable the listing without a plan entry, staged-commit rule). Note it still cites `PI_ALLOW_LOCKFILE_CHANGE`. |
| root `README.md` (+28) | fork | Low value beyond the rename; logo URL still `pi.dev`. |
| `packages/coding-agent/README.md` (254 changed) | fork | **Requires the Philosophy / interface / command-table rewrite before publishing** (§8.7). Provider list, env-var tables, CLI reference, session/compaction sections are accurate and worth keeping. |
| `docs/environment-variables.md`, `settings.md`, `keybindings.md`, `themes.md`, `quickstart.md`, `index.md`, `development.md` | fork | Carry after finishing the rename sweep. `settings.md` and `environment-variables.md` are in good shape. |
| **`tui-plan.md` (1002)** | **UPSTREAM** (added `ea1e77e2d`, 2026-07-31, an ancestor of the fork point) | **Not a fork artifact.** Carry as inherited upstream architecture doc. Caveats: its verification commands assume upstream's workflow, and it predates flux's UI (does not know about `blockFill`, the tab row, or the shine). |

---

## 10. Port plan

### 10.1 Collision analysis

```bash
git diff --name-only 6160683a4 HEAD                 # 268 flux-changed files
git show --name-only --format='' b13c8d5c8         # 700 Fork-V2 rename files
comm -12 <(… | sort) <(… | sort)                   # 180 overlap
```

- **31 files are fork-added** — port cleanly, no conflict. These are listed in §3
  Bucket B and are the bulk of the new value.
- **180 files overlap** with the rename commit. For these, do **not** cherry-pick
  `openai-alike`'s version — take `Fork-V2`'s renamed file and re-apply only the
  flux logic. Heaviest overlap: `packages/coding-agent/test` (38),
  `coding-agent/src/core` (14), `packages/ai/test` (14),
  `coding-agent/docs` (10), `packages/ai/src/api` (10).

### 10.2 Suggested order

1. **Base:** branch from `Fork-V2` (`b13c8d5c8`) so the rebrand is already done
   correctly. Optionally rebase onto newer `upstream/main` (v0.87.1) first.
2. `packages/tui`: `src/shine.ts` + the 10 re-exports; then `editor.ts`
   (`BlockShineOptions`, the 5 `EditorOptions` fields, the shine machinery,
   prompt/placeholder/rightHint, mouse offset), `loader.ts`, `select-list.ts`,
   `editor-component.ts`, `autocomplete.ts`. Add the missing
   `type BlockShineOptions` export. Port `test/shine.test.ts` and the
   `editor.test.ts` additions.
3. `core/permission-mode.ts` (leaf dependency: only `node:path.basename`), then the
   read-only shell allowlist fix — it is a **security fix**, land it early.
4. `core/question-service.ts`, `core/question-picker-state.ts`,
   `core/tools/ask-user.ts`, `core/tools/renderers/ask-user.ts`, registry entries.
5. `core/agent-supervisor.ts`, `core/tools/agent-supervisor.ts`,
   `AgentSession.attachAgentSupervisor`.
6. `AgentSession` changes: fields, `beforeToolCall` gate order (plan → manual →
   extensions), `getEffectiveSystemPrompt`, `setPermissionMode`, plan tool snapshot
   and restore, `assertToolCallPermitted`, abort/dispose hooks, the
   `permission_mode_changed` event, the new default active tools.
7. Thread `questionHandler` / `questionService` / `permissionMode` through
   `core/sdk.ts`, `core/agent-session-services.ts`, `core/index.ts`, `src/index.ts`.
8. RPC: types, server handlers, client methods.
9. Interactive mode last (it depends on everything above): `AgentTabsComponent`,
   `QuestionPickerComponent`, footer rework, work summary bar, `/work-mode`,
   `/agents`, `app.permission.cycle`, approval handler, attention bell, settings,
   `main.ts` supervisor.
10. Port the fork's tests alongside each step — they encode the intended behavior
    (§4.1.6, §5.x test lists).
11. Decide deliberately about the doc set (§9) and add CI back if wanted (§7).

### 10.3 Decisions to make on the new fork

- npm publish identity: `@earendil-works/pi-*` vs a flux-scoped rename.
- Whether to keep the startup listing commented out or delete it.
- Which changelog is authoritative (`FLUX_CHANGELOG.md` vs `flux.md`).
- Whether to migrate the 8 legacy-style menus to `menu-style.md` (§4.3).
- Whether `ask_user` should really be a default-active tool for all SDK consumers.
- **Version scheme.** `0.1.0` collides with upstream's own published `0.1.0`
  artifacts, which is what makes the lockfile pins ambiguous (§8 item 17). Pick a
  version that cannot be confused with an upstream release before generating any
  lockfile, and regenerate `npm-shrinkwrap.json` +
  `packages/coding-agent/install-lock/` from scratch.
- **`pi-managed-install` marker kind.** `package-manager-cli.ts:71` now requires
  `marker.kind === "flux-managed-install"`, so flux will not recognize an install
  made by upstream's manager and will not self-update it. Fine if flux installs are
  always fresh; needs a migration path if not.
- **Whether to keep any pi.dev endpoint at all** (§8 item 24). Deleting the
  update/telemetry cluster (§8 items 1, 23) is the cheaper path than repointing it,
  since a fork that does not exist yet cannot serve those endpoints.

---

## 11. Verification status

- All line counts, file lists, symbol names, and quoted constants in this document
  were read from the tree or from `git diff 6160683a4 HEAD` at HEAD `a5d1b59dc`.
- The `Fork-V2` / `openai-alike` relationship was verified against `upstream/main`
  fetched live from `github.com/earendil-works/pi`.
- The test suite was **not** run as part of producing this document. Known
  pre-existing failures on Windows (recorded in `b13c8d5c8`'s message):
  `scripts/coding-agent-consumer.test.mjs` fails when the Node path contains a
  space, and `experimental-remote-runtime.test.ts` requires Unix sockets.
- Every §8 item was re-checked against the tree before being written down. Two
  claims that did not survive checking are recorded as corrections, not findings:
  (a) the missing-`integrity` pattern in `npm-shrinkwrap.json` is **inherited from
  upstream** (`6160683a4` has the same shape at `0.85.1`), so only the version
  collision is fork-introduced — §8 item 17 is worded accordingly; (b) an earlier
  draft of this document repeated `flux.md`'s DeepSeek peak-rate claim and had to be
  retracted — see §8 item 5. Where a claim rests on a claim, prefer the tree.
- `packages/tui/test/editor.test.ts` must be run as `node --test test/editor.test.ts`
  from `packages/tui`; the coding-agent Vitest suite cannot resolve
  `@earendil-works/pi-tui` until `packages/tui/dist` is built.
