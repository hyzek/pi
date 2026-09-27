# Flux — Fork Plan

## Purpose

This fork of [`earendil-works/pi`](https://github.com/earendil-works/pi) exists to reshape
the pi coding agent into **flux**: a sleeker, more opinionated CLI in the mold of
Anthropic's Claude Code and OpenAI's Codex CLI.

Design direction, in rough priority order:

1. **Minimal ceremony at startup** — no wall of loaded resources (extensions, skills,
   prompts, themes). Quiet by default; details on demand (`/status`), never at boot.
2. **Sharp, focused TUI** — clean status/context surfaces, fewer visual layers between the
   user and the transcript; borrow interaction patterns from Claude Code / Codex that
   reduce friction (fast model/tool switching, obvious permission prompts).
3. **Less noise, more signal** — opinions become defaults: quiet startup, terse headers,
   and condensed change reports.
4. **Name and identity** — the product ships as `flux`, not `pi`.

This document concludes the plan for the fork. Decisions recorded here are the intended
scope unless implementation findings force a revisit (same convention as `tui-plan.md`).

## Development workflow

Checkout: `/Users/leo/dev/flux` (fork of `earendil-works/pi`, origin `hyzek/pi`).

The `flux` command on PATH is a **dev launcher** (`~/.local/bin/flux`) that runs the
TypeScript source directly with `tsx` — the same recipe as the repo's `pi-test.sh`
(`packages/coding-agent/src/experimental/cli.ts`), no dist build required. It keeps the
caller's cwd. Override the checkout with `FLUX_REPO`.

Fresh checkout bootstrap:

```bash
npm install --ignore-scripts          # workspaces; no lifecycle scripts
npm --prefix packages/ai run generate-models   # one-time: builds gitignored src/providers/data (network fetches)
flux --help                           # smoke test
```

Notes:

- `packages/ai/src/providers/data/` is gitignored generated model data; a fresh clone
  must run the generator once before the source boots.
- The dev `flux` uses config dir `~/.flux/agent` (from `piConfig.configDir`), fully
  isolated from the installed pi's `~/.pi/agent` — safe to run side by side.
- Env overrides follow the config: `FLUX_CODING_AGENT_DIR`, `FLUX_CODING_AGENT_SESSION_DIR`.
- Repo rules (AGENTS.md): run `npm run check` after code changes; `./test.sh` for
  non-LLM tests; never `git add -A`; no commits without the user asking.

## Milestone 1 — Rename the CLI to `flux`

The first change. Goal: `flux` (not `pi`) opens the agent. A rename has two layers —
the **command surface** (what the user types, sees, and configures) and the
**package surface** (npm identities and internal identifiers). They can move at different
speeds; milestone 1 targets the command surface end to end.

### Status — execution log

Done in this session (2025-09-08):

- [x] Repo folder renamed `~/dev/pi` → `~/dev/flux`
- [x] `packages/coding-agent/package.json` — rebrand via the documented `piConfig` hook
      (drives `APP_NAME`, `APP_TITLE`, env-var prefixes, config dir at runtime; no source
      edits needed for the core rename):
      - `piConfig.name: "flux"` → banner/help identify as flux
      - `piConfig.configDir: ".flux"` → user config + project config discovery isolated
        from pi
      - `bin`: added `"flux": "dist/bundle/cli.js"`, kept `"pi"` as dev-time alias
      - `build:binary` outfile `dist/pi` → `dist/flux`
- [x] Dev launcher `~/.local/bin/flux` on PATH (tsx from source, see Development workflow)
- [x] One-time model-data generation; `flux --version` → `0.85.1`, help banner reads
      "flux - AI coding assistant"
- [x] Verified working tree: only `package.json` modified + `flux.md` untracked
      (generated data is gitignored; `models.generated.ts` untouched)

Remaining (command surface):

- [ ] Copy sweep: hardcoded "pi" strings still user-visible (e.g. `flux update ... pi`
      in help, "pi" in `/debug` path `~/.flux/agent/pi-debug.log` unless driven by
      APP_NAME, model system-prompt identity, first-run copy)
- [ ] Root test harness rename: `pi-test.sh` / `.ps1` / `.bat` → `flux-test.*`
- [ ] Confirm TUI title bar / startup header render "flux" (visual check in a TTY)
- [ ] Publish-time: drop the `pi` bin alias; verify `npm install -g` exposes only `flux`

### Command surface (targets)

| Area | Today | Target | Where | Status |
| --- | --- | --- | --- | --- |
| CLI bin | `"pi": "dist/bundle/cli.js"` | `"flux": "dist/bundle/cli.js"` (+ dev alias `pi`) | `packages/coding-agent/package.json` | done |
| Standalone binary | `dist/pi` | `dist/flux` | `build:binary` outfile | done |
| Banner / help identity | `pi` / `π` | `flux` | driven by `piConfig.name` | done |
| User-facing copy | "pi" strings | "flux" | grep across `packages/coding-agent/src` | open |
| Root test harness | `pi-test.sh` / `.ps1` / `.bat`, `mini-test.sh` | `flux-test.*` | repo root | open |

### Configuration & environment

| Area | Today | Decision | Notes |
| --- | --- | --- | --- |
| Global config dir | `~/.pi/agent` | `~/.flux/agent` | via `piConfig.configDir: ".flux"`; isolated from installed pi |
| Project config dir | `.pi/` | `.flux/` | follows `CONFIG_DIR_NAME` (trust prompt, project settings/skills discovery) |
| Env var prefix | `PI_*` | `FLUX_*` | auto-derived from `piConfig.name` (`FLUX_CODING_AGENT_DIR`, `..._SESSION_DIR`) |
| Share viewer URL | `pi.dev`, `FLUX_SHARE_VIEWER_URL` | keep for now | external viewer service; revisit with identity |

Existing pi users get no migration: this is a fork with its own identity and config
surface; the installed pi keeps `~/.pi` untouched. Revisit if flux replaces pi locally.

### Package surface (explicitly deferred)

| Area | Today | Status |
| --- | --- | --- |
| Monorepo root | `pi-monorepo`, workspaces | Keep internal for now |
| npm packages | `@earendil-works/pi-*` (10 packages) | Publishing identity — decide when we publish |
| Package name deps | `packages/evals` imports `@earendil-works/pi-coding-agent` | one reason the npm rename is deferred |
| Session dir / formats | `~/.pi/sessions`, pi session metadata | follows config dir |

## Implemented customizations

Recorded as they land; each entry lists what, why, where, and how it was verified.

### Completed-work duration bar (2026-09-11)

**What:** After each completed agent run, the transcript shows a full-width dim separator
such as `─ Worked for 6m 16s · 16.5k tokens ─────────────────`.

**Why:** Make the end of a run visually explicit and expose the total elapsed work time and
token usage in a compact, friendly format.

**Where:** `packages/coding-agent/src/modes/interactive/interactive-mode.ts` tracks the
`agent_start`/`agent_end` interval and totals the run's input, output, cache-read, and
cache-write tokens; `components/worked-duration.ts` formats and renders the bar.

**Verified:** `npm run check` exit 0; coverage added for duration formatting, bar width,
and insertion on `agent_end`.

### Status bar hides while the "/" command menu is open (2025-09-08)

**What:** When the editor's autocomplete menu (the "/" command dropdown) is expanded,
the bottom status bar (tokens up/down, cache rate, cost, context, model-effort) is
hidden instead of being pushed down below the menu.

**Why:** Sleekness direction — the menu replaces the status bar rather than displacing it.

**Where:**

- `packages/tui/src/components/editor.ts` — the menu renders as extra lines after the
  editor's bottom border (that growth is what pushed the footer). Added the
  `onAutocompleteVisibilityChange?` hook, fired from `applyAutocompleteSuggestions`
  (menu appears) and `clearAutocompleteUi` (menu disappears: escape, accept, submit,
  empty results).
- `packages/tui/src/editor-component.ts` — optional callback declared on the
  `EditorComponent` interface so custom/extension editors can opt in.
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — wires the hook to
  the footer: while visible is false the `footerContainer` is emptied (zero rendered
  lines), so the menu occupies the space; `refreshFooterContainer()` re-adds the active
  footer (built-in or extension custom) when the menu closes. Hook is copied onto custom
  editors in `setCustomEditorComponent`.

**Scope note:** the hook tracks the autocomplete menu generally, so "@"/"#" file
completion popups also hide the footer. Slash-only scoping is possible via
`isInSlashCommandContext` if ever wanted.

**Verified:** new regression test in `packages/tui/test/editor.test.ts` asserts
`[true]` on open and `[true, false]` on close. Editor suite: 187/187 pass.

### Command dropdown formatting: no arrow marker, commands listed as /name (2025-09-08)

**What:** The slash-command menu no longer draws the "→" marker on the highlighted row,
and commands read as `/model`, `/compact`, etc. instead of bare `model`.

**Why:** Sleeker list; the accent color already marks the selected row, and commands are
typed with a leading slash so the list should show them that way.

**Where:**

- `packages/tui/src/components/select-list.ts` — `SelectListLayoutOptions` gained
  `selectedItemMarker?` (default "→ "); `renderItem` uses it for the selected row.
- `packages/tui/src/components/editor.ts` — the slash-command layout
  (`SLASH_COMMAND_SELECT_LIST_LAYOUT`) passes `selectedItemMarker: "  "`, keeping column
  alignment identical for selected and unselected rows.
- `packages/tui/src/autocomplete.ts` — slash-command items keep `value: name` (insertion
  adds the "/" via `applyCompletion`) but now render `label: "/name"`.

**Scope note:** marker override is opt-in per layout, so other select lists (session
picker, model argument sub-menu, settings) keep the arrow.

**Verified:** `packages/tui` editor/autocomplete/select-list suites: 219/219 pass.
Biome and `tsgo --noEmit` clean.

### Startup screen rework: no verbose loaded-resources listing (2025-09-08)

**What:** flux never renders the verbose startup listing that pi shows when "quiet
startup" is off — the [Context]/[Skills]/[Prompts]/[Extensions]/[Themes] sections. In
pi that surface is controlled by `settings.json` (`"quietStartup": true` disables it) and
the `--verbose` flag. In flux it is removed entirely, independent of config.

**Why:** quiet-by-default startup is a stated fork goal; those stats are dev noise on
every boot.

**Where:**

- `packages/coding-agent/src/core/settings-manager.ts` — `getQuietStartup()` now defaults
  to `true` (was `false`). The `quietStartup` setting still exists as the breadcrumb for
  this behavior and still gates the startup header/keybinding hints: setting it to `false`
  (or `--verbose`) restores the header, but never the removed listing.
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` —
  `showLoadedResources()` now forces `showListing = false`. The whole listing block and
  its helper closures are **commented out in place** (not deleted), including the five
  private helpers that existed only for it (`formatExtensionDisplayPath`,
  `formatContextPath`, `getCompactExtensionLabels`, `buildScopeGroups`, `formatScopeGroups`)
  plus their transitively-orphaned cluster (compact-path label helpers) and the now-unused
  `type ThemeColor` and `getCwdRelativePath` imports. Every commented region carries a
  "FLUX (commented out)" marker describing how to restore it.

**Behavior notes:**

- The loaded-resources **diagnostics** (skill/prompt/extension conflicts and errors)
  still render at startup — same as pi with `quietStartup: true` — so broken resources
  are not silently hidden.
- Restore path if these stats are wanted later: set `showListing` back, uncomment the
  listing block/helpers/imports per the markers, and flip the `getQuietStartup()` default
  back if desired. See flux.md and the markers in code.

**Verified:** `tsgo --noEmit` clean; Biome clean on both files (lints + formatting).
No TUI-level automated test covers this (needs a live terminal); behavior is gated by
`showListing = false` + removed render code.

### Startup banner: flux wordmark + model/directory summary (2025-09-08)

**What:** The default (quiet) startup now renders a branded banner instead of an empty
header: bold blue `flux` with the version on one line, then two dim info lines —
`model: <id> <thinking-level>` (with a yellow `/model` hint) and `directory: <cwd>`
(home abbreviated to `~`).

**Why:** the earlier quiet-startup rework removed pi's verbose resource listing, but left
boot with nothing at all; this gives the sharp, low-ceremony identity line without
bringing back the wall of loaded resources.

**Where:**

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — new
  `buildFluxStartupHeader()` assembles the banner; the `quietStartup` branch of `init()`
  now mounts it (with a leading/trailing spacer) instead of an empty `Text`. The
  `--verbose`/`quietStartup: false` branch is unchanged.
- `packages/coding-agent/src/modes/interactive/theme/theme.ts` — added `blue` and
  `yellow` to `ThemeColor` as optional tokens that fall back to `border`/`warning` when a
  theme omits them.
- `packages/coding-agent/src/modes/interactive/theme/theme-json.ts` + `theme-schema.json` —
  schema allows/document the two new optional colors.

**Verified:** `tsgo --noEmit` clean; Biome clean; theme test suite (`scrollbar-theme`)
passes; live TTY check shows the banner with bold blue `flux`, yellow `/model`, and dim
info text resolving to `#5f87ff`/`#ffff00`/`#666666` on the dark theme.

### Version reset to 0.1.0 (2025-09-08)

**What:** The fork restarts versioning at `0.1.0` across all workspace packages
(lockstep), including dependency ranges, the root `package-lock.json`, the coding-agent
`npm-shrinkwrap.json`, and the installer lock.

**Why:** flux is a new product line; carrying pi's `0.85.1` version forward would make
the fork's releases collide with upstream pi versions.

**Where:**

- all `packages/*/package.json` + `packages/session-backends/*/package.json` — `version`
  and internal `^0.85.1` dep ranges → `0.1.0`.
- `packages/coding-agent/examples/extensions/*/package.json` (private examples) — `version`
  → `0.1.0`.
- `package-lock.json`, `packages/coding-agent/npm-shrinkwrap.json`, and
  `packages/coding-agent/install-lock/*` regenerated via `npm install --package-lock-only`
  and the two generate scripts.

**Side effect:** the built-in update check now sees `0.1.0` as older than pi's latest
published release and shows an "Update Available" notice at startup. Deciding whether
flux should skip/repurpose that check is an open decision (see below).

**Verified:** `npm run check:shrinkwrap`, `check:install-lock:coding-agent`,
`check:pinned-deps`, `check:runtime-deps` all pass; `tsgo --noEmit` and Biome clean;
`flux --version` and the TUI header report `0.1.0`.

### Update-check notice suppressed for rebranded builds (2026-09-09)

**What:** The startup "Update Available" notice is now shown only when the binary is
`pi` itself. Rebranded builds (flux) skip the pi.dev version check entirely.

**Why:** flux resets `VERSION` to `0.1.0`, so the pi.dev `latest-version` channel
always reported pi's `0.85.1` as a newer release and announced a spurious update at
every boot. flux's version is an independent product line, not an old pi commit, so
comparing it to pi's channel is meaningless.

**Where:** `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — the
boot-time `checkForNewPiVersion(...)` call is wrapped in `if (APP_NAME === "pi")`.
`APP_NAME` flows from `piConfig.name` ("flux" here, undefined → "pi" in upstream),
so the gate is identity-based rather than a hardcoded name. The lower-level
`getLatestPiRelease` / `checkForNewPiVersion` in `version-check.ts` are unchanged so
the `pi update` self-update path and the unit tests stay intact.

**Verified:** `tsgo --noEmit` clean; Biome clean on the changed file;
`test/version-check.test.ts` 10/10 pass (version-check logic untouched).

### Theme rework: blue accent, bold menus, effort ramp (2026-09-09)

**What:** Recolored the default theme and made all menus bold. The muted teal accent is
now blue; menu text renders bold; the thinking-effort ramp now goes gray → dim blue →
bright blue → fiery red-orange; and the footer paints its "effort" label in the same color
as the thinking-effort bar for the current level.

**Why:** flux's default theme read bland. The teal accent showed up everywhere it matters
(menus, model-message inline code and list bullets), and the thinking-effort colors were
pink/purple at the high end ("high" was a mauve, "max" was magenta).

**Where:**

- `modes/interactive/theme/dark.json` + `light.json` — `accent`/`borderAccent`/`mdCode`/
  `mdListBullet` now reference `blue` (teal var removed); `thinkingOff`/`Low` kept, and
  `Medium`/`High`/`Xhigh`/`Max` recolored (dark: `#6fa8dc` / `#4d9fff` / `#ffa63f` / `#ff5f3c`).
- `modes/interactive/theme/theme.ts` — `getSelectListTheme` and `getSettingsListTheme`
  now render their text in bold; select-list theme gained `primaryText` (bold for
  non-selected item text).
- `packages/tui/src/components/select-list.ts` — new optional `SelectListTheme.primaryText`
  (defaults to identity), applied to non-selected item primary text; `renderItem` routes
  through it. Menus, model/session/theme/thinking selectors, and settings all inherit this.
- `modes/interactive/components/footer.ts` — the `model • effort` suffix paints `effort`
  with `theme.getThinkingBorderColor(level)`, matching the effort bar.

**Verified:** `npm run check` exit 0; tui `node --test` select-list + mouse-components
pass; coding-agent footer/max-thinking/thinking-selector/scrollbar-theme/theme-controller/
theme-detection pass. `theme-export.test.ts` and `theme-picker.test.ts` fail because they
hardcode `PI_CODING_AGENT_DIR` while flux reads `FLUX_CODING_AGENT_DIR` (open decision #4);
unrelated to this change.

### Working indicator: floating, smooth pulsing dot + sweeping word (2026-09-09)

**What:** Reverted the working/status indicator that a recent pi change had embedded into
the editor's top border. The braille spinner is replaced by a `•` dot that breathes on the
256-color grayscale ramp (index 244 `#808080` → 255 near-white) — a continuous, bright-biased
raised cosine (white → gray → white) so it never sits flat or snaps — plus a live
elapsed-seconds message `Working (Ns • esc to interrupt)` whose word sweeps a white shine
left→right that fades in/out (sin envelope), so the end melts away instead of cutting before
the restart. Branch `openai-alike`.

**Why:** The embedded indicator looked cramped inside the colored input bar; the user
wants it floating above the input, animated like Codex: the dot breathes smoothly, and the
working word shines from left to right without a hard reset.

**Where:**
- `interactive-mode.ts` — default editor created with `embedWorkingStatus: false`, so
  status indicators render in the `statusContainer` dock row (floating) instead of the
  editor border. `CustomEditor` still supports `embedWorkingStatus: true` for opt-in/custom
  editors.
- `components/status-indicator.ts` — `WorkingStatusIndicator` defaults to a 24-frame
  gray-to-white dot breathe (interval 40ms) from a raised-cosine brightness curve, overrides
  the Loader message hook to sweep the working word left→right with a fading shine, and
  drives a per-second elapsed timer appending `(Ns • esc to interrupt)` (Escape short-form
  `esc`). Retry/compaction/branch-summary keep their spinners.
- `packages/tui/src/components/loader.ts` — `frames`/`currentFrame`/`messageColorFn` are now
  `protected`; `updateDisplay` delegates to new `getIndicatorText()` and
  `renderMessage(message, frameIndex)` hooks so subclasses can animate the message text
  (default behavior unchanged).

**Verified:** `npm run check` exit 0; `tsgo --noEmit` clean;
`test/status-indicator.test.ts` 5/5 pass (embedded-line expectation updated from the braille
frame to the dot; standalone-line asserts the dot, muted message, and `to interrupt`).
`interactive-tui`/`interactive-mode-compaction` tests are blocked by a pre-existing
`@earendil-works/pi-ai/utils/uuid` subpath resolution failure (needs the ai build),
unrelated to this change.

### Input bar: dark-gray filled block with a "❯" prompt (2026-09-09)

**What:** The input editor now renders as a dark-gray filled block (3 lines for a
single-line prompt: top fill, input line, bottom fill) instead of thin top/bottom border
lines, with a `❯` prompt prefix before the text. Branch `openai-alike`.

**Why:** The thin border lines read as a flimsy 2-line input; a solid filled block with a
prompt arrow looks like a padded, Codex-style input.

**Where:**
- `packages/tui/src/components/editor.ts` — `EditorOptions` gained `prompt` and `blockFill`.
  When `blockFill` is set, every rendered line (top/bottom fill + input) is wrapped in it,
  the prompt prefix is prepended to the first input line, the text layout width reserves
  the prompt columns, and the cursor/mouse offsets account for the prefix on that line.
  Without `blockFill` the default border behavior is unchanged.
- `interactive-mode.ts` — the default editor is built with `prompt: "❯"` and
  `blockFill: (text) => theme.bg("selectedBg", text)`.

**Verified:** `npm run check` exit 0; `tsgo --noEmit` clean; tui `node --test`
`editor.test.ts` 188/188 pass (added a prompt + filled-block regression test), and
`mouse-components` + `select-list` pass. Rendered output confirms a 3-line filled block
with the cursor sitting right after `❯ hello`.

### Input bar: Codex-style prompt, placeholder, and neutral background (2026-09-09)

**What:** The input bar now uses a slim `›` prompt, the placeholder `Ask flux anything`
while empty, and a neutral-gray filled block. The placeholder is muted and
display-only; it does not become editor text.

**Where:** `EditorOptions` now supports `placeholder` and `placeholderStyle` in addition
to the existing prompt and block-fill options. The default interactive editor uses the
new presentation, and the block fill is backed by an optional `inputBg` theme token
(`dark: #3c3c3c`, `light: #e7e7ea`) that falls back to `selectedBg` for custom themes.
The theme schema and `docs/themes.md` document the token. `inputbox.md` contains the
input-box behavior and follow-up notes.

**Verified:** `tsgo --noEmit`, `npm run check`, and the TUI editor suite pass; editor
regression coverage includes prompt, filled-block, cursor, and placeholder rendering
(189/189 tests).

### Selector menus: gray input surface and compact model rows (2026-09-11)

**What:** The model picker and settings menu now render inside the same gray input
surface as the prompt editor. Model rows keep the existing visible count, with model
name and status on the left and provider metadata in the right-hand column. Settings
rows no longer render the `→` selector prefix.

**Where:** `interactive-mode.ts` wraps only these two selectors in the shared TUI `Box`
using `inputBg`. Their standalone border rows were removed. The model selector uses a
fixed primary column so provider values align; `getSettingsListTheme()` uses a blank
cursor prefix. `inputbox.md` documents the layout.

**Verification:** Biome and `tsgo --noEmit` pass. The focused model/settings Vitest
files remain blocked before test loading by the existing
`@earendil-works/pi-ai/utils/uuid` subpath resolution failure.

### Compact agent transcript: hidden reasoning and summarized tools (2026-09-11)

**What:** The interactive transcript now defaults to a compact Codex-style presentation. Model
thinking is omitted from the transcript while the working indicator is active. Tool calls stay
hidden while arguments stream, then render as one-line action summaries such as `Reading file`,
`Edited file`, or `Ran npm run check`; errors remain visible in concise form. The existing
expanded tool view still exposes detailed renderer output on demand.

**Why:** Raw thinking and tool payloads made normal agent runs noisy and exposed implementation
detail instead of progress. The default view should communicate what the agent is doing, not the
wire format used to do it.

**Where:**

- `settings-manager.ts` — hidden thinking is now the default for new settings.
- `components/assistant-message.ts` — hidden thinking creates no transcript row when the compact
  interactive label is empty.
- `components/tool-execution.ts` — compact action/status rows, delayed visibility until execution,
  and detailed output restored by expansion.
- `interactive-mode.ts` — interactive tool components opt into compact rendering.

**Verified:** focused assistant/tool component tests pass (40/40); `npm run check` and
`tsgo --noEmit` pass.

### Compact tool rows: shared working dot and indented output (2026-09-11)

**What:** Compact tool rows now reuse the animated working dot from the main status indicator
while a tool is running. Completed rows use a static white dot instead of a check mark and omit
terminal prompt decoration. Successful tool output stays hidden in the compact row; detailed
output remains available through expansion.

**Where:** `components/status-indicator.ts` exports the shared dot frames;
`components/tool-execution.ts` uses them for live rows and concise completed actions;
`components/assistant-message.ts` renders agent replies as indented static-dot blocks.

**Verified:** focused assistant/tool component tests pass (41/41); `tsgo --noEmit` passes.

### DeepSeek peak-rate warning in the footer (2026-09-11)

**What:** The interactive footer now prefixes the model name with red `peak` when the
active model uses the direct DeepSeek API during DeepSeek's peak-rate windows.

**Why:** DeepSeek's current API pricing doubles on weekdays from 01:00–04:00 UTC and
06:00–10:00 UTC. The warning should reflect the actual instant regardless of the user's
local timezone or daylight-saving rules.

**Where:** `components/footer.ts` compares the current `Date` against the published UTC
windows, refreshes at the next rate boundary, and recognizes direct DeepSeek providers or
`deepseek.com` endpoints. Models routed through OpenRouter or another provider are not
marked because DeepSeek's direct pricing schedule does not apply to those requests.

**Verified:** Added coverage for weekday/weekend boundaries, direct-provider rendering,
and non-direct routing. `npm run check` and `tsgo --noEmit` pass; the focused footer suite
is blocked before test loading because the workspace `@earendil-works/pi-tui` package has no
built entry in this checkout.

### Flux identity sweep (2026-09-11)

**What:** Removed remaining upstream branding from runtime-facing identity, prompts, help,
notices, provider user-agent headers, and the startup changelog. The package now exposes
only the `flux` executable.

**Where:** `core/system-prompt.ts` uses the configured app name; `FLUX_CHANGELOG.md` is
used by `/changelog` and startup notices; CLI and interactive notices use Flux wording;
provider headers identify Flux; the package scripts ship the Flux changelog and no `pi`
binary alias.

**Verified:** Updated system-prompt, package-distribution, user-agent, and provider-header
coverage. `npm run check` passes; the focused coding-agent and AI suites pass (116 tests).

### Permission modes and compact footer (2026-09-12)

**What:** Interactive Flux now defaults to `manual mode`, with `/mode` switching between
`manual mode`, `plan mode`, and `auto mode`. Manual mode permits read-only tools such as
`rg` and `git diff`, while mutating, shell, and unknown custom tools require an approval
dialog. Auto mode skips approval. Plan mode exposes only `read`, `grep`, `find`, `ls`, and
`ask_user`; mutating, shell, and custom tools are unavailable and are rejected at
execution time.

The plan-mode gate is enforced in the shared `AgentSession`, before side-effect-capable
extension tool-call hooks. SDK sessions expose the initial mode, RPC exposes mode state and
switching, interactive direct shell commands are guarded, and configured tool allowlists
and denylists remain effective when modes change. Leaving plan mode restores the exact
pre-plan active tool set.

The footer now shows the mode, model/reasoning effort, and a compact context field whose
background split follows usage across the rendered token details. Path, cache, cost, and
provider displays were removed; the model and effort are muted. Extension status and
warning lines remain available below the compact footer.

**Where:** `core/permission-mode.ts`, `core/agent-session.ts`, the interactive `/mode`
command, and `components/footer.ts`.

**Verified:** `npm run check` and Biome pass. Focused question tests pass; session-based
permission tests remain blocked locally by the unbuilt `@earendil-works/pi-ai/utils/uuid`
workspace import.

### Selector and effort UI (2026-09-15)

**What:** Renamed the interactive `/thinking` command to `/effort`, colored reasoning
levels only in the effort picker, and opened that picker immediately after model
selection. Selectors now use gray boxes where applicable and indicate selection with
colored text rather than arrow markers. Shift-Tab now cycles permission modes in the order
plan, auto, manual; the footer labels each mode with a themed color and icon. The footer
keeps model and effort labels muted.

**Where:** Shared `SelectList` rendering, interactive model/effort selectors, the
experimental slash-command surface, and the interactive footer.

**Verified:** TypeScript and focused selector tests pass where the workspace harness can
resolve its package entrypoints; harness-based tests remain blocked by the existing
unbuilt `@earendil-works/pi-ai/utils/uuid` workspace import.

### Structured question service (2026-09-15)

**What:** Added the first question-picker delivery gate's UI-independent request/response
service and built-in `ask_user` tool. Requests are validated to 1–5 questions with 2–3
options, receive a mandatory custom-answer option, support submitted/cancelled/unavailable
outcomes, abort and stale-response handling, and persist request/response custom entries
when created through `AgentSession`.

**Where:** `core/question-service.ts`, `core/tools/ask-user.ts`, and the session/SDK
tool registry wiring. The service accepts a host handler; without one, the tool returns
`unavailable` immediately so print mode cannot hang. The interactive TUI and RPC
presentation handlers are wired to the same service.

**Verified:** Focused question-service tests (7/7), `tsgo --noEmit`, and Biome formatting
on new files pass.

### Interactive question picker (2026-09-15)

**What:** Added a reusable question-picker state machine and interactive component. The
interactive session now owns the `QuestionService` handler, with one-question-at-a-time
navigation, progress, mandatory custom answers, empty-input rejection, back/edit behavior,
review before submission (including single-question batches), cancellation, wrapped narrow
terminal rendering, and configurable question navigation bindings. Session abort and
replacement cancel pending picker requests.

**Where:** `core/question-picker-state.ts`, `components/question-picker.ts`, interactive
session wiring, `core/keybindings.ts`, and picker tests.

**Verified:** Focused picker/service tests (10/10), `tsgo --noEmit`, Biome, and `npm run check`
pass. RPC request/response messages and a remote question handler are implemented.

### RPC questions and delegated-agent visibility (2026-09-15)

**What:** Added JSONL question request/response messages with request IDs. RPC hosts can
register a callback or respond explicitly; the server returns an immediate unavailable
result until a host handler is enabled, and stale/duplicate responses are rejected by
`QuestionService`. The CLI now creates the read-only `AgentSupervisor`, and `/agents`
lists child title/task, state, elapsed time, model, and bounded result/error with inspect,
message, and stop actions.

**Where:** RPC types/mode/client, `main.ts`, `AgentSession` supervisor access, the built-in
slash-command registry, and `interactive-mode.ts`.

**Verified:** Focused RPC question and supervisor tests, `tsgo --noEmit`, and Biome pass.
Write-capable children, nested delegation, and event-pushed agent updates remain deferred.

### Supervisor tool registration fix (2026-09-15)

**What:** Made active tool registration idempotent and removed a redundant supervisor-tool
append that produced duplicate `spawn_agent`/lifecycle names in model requests. This fixes
the provider error `Tool names must be unique` when the CLI attaches its supervisor.

**Verified:** `npm run check`, the focused question/RPC/permission tests (18/18), and the
supervisor lifecycle suite (7/7) pass. The default supervisor test command still needs the
existing temporary workspace alias for the unbuilt `@earendil-works/pi-ai/utils/uuid`
import used by the separate agent harness.

### Sub-agent chat tabs (2026-09-16)

**What:** Spawning a child adds a tab row directly below the message input, with the same
background. The main tab uses the shortened session name; child tabs use model-supplied short names. The visible
chat is underlined. Left/Right switches transcripts while the input is empty; editing keys retain
their usual behavior while text is present. Main and child transcripts have separate containers,
so parent updates do not appear in a child tab. The footer keeps the main model visible and shows
the selected child's live token volume; output generated before provider usage arrives is marked
as an estimate. Escape interrupts the visible child without changing tabs. Child input is sent to
that child, and saved child transcripts can be reopened after resuming a session.

**Where:** `core/agent-supervisor.ts` live usage snapshots and parent resumption; interactive
`AgentTabsComponent`, `FooterComponent`, editor keybindings, and transcript rendering.

**Verified:** Focused tab/footer/editor tests, supervisor lifecycle tests, and `npm run check`.

**Follow-up (2026-09-16):** Sanitize session names and child task titles before rendering
terminal tabs or the selected-child footer field. Truncate plain tab labels before applying
colors and underline so the truncation helper's ANSI reset cannot erase the input-row
background at an ellipsis. Covered by focused tab/footer regression tests.

**Follow-up (2026-09-16):** Hide the tab row while a selector, extension dialog, overlay,
or slash-command autocomplete replaces the chat editor. Each spawn now requires a distinct
model-supplied name of 1–5 ASCII letters, and a parent session can have at most five child
agents. `wait_agents` acknowledges terminal results so they do not cause a duplicate parent
turn. Unconsumed completions still wake the parent, but through a hidden custom message
rather than a user-role prompt. Focused supervisor and tab tests cover these paths.

### Attention bell (2026-09-16)

**What:** The interactive CLI rings the terminal bell when an agent run settles or when
manual tool approval or an agent question needs input. This is enabled by default and can
be disabled with `terminal.attentionBell` or `/settings`.

**Where:** `interactive-mode.ts`, `settings-manager.ts`, and the interactive settings UI.

**Verified:** Focused settings and interactive-mode tests, `tsgo --noEmit`, Biome, and
`npm run check`.

## Milestone 2+ — Sleekness backlog (sketches)

Tracked here at plan level; each becomes its own detailed doc + PR when started.

- **Harness capabilities (proposed 2026-09-15):** [harness-plan.md](harness-plan.md)
  plans the built-in multi-step question picker and supervised sub-agents, including
  plan-mode tool policy, model inheritance, permissions, and workspace coordination.
The question service, built-in tool, interactive TUI picker, RPC presentation, and
read-only supervisor visibility are implemented; write-capable children remain future work.
- **Quiet-by-default startup** (mostly done — see Implemented customizations): loaded-
  resources listing removed entirely; `quietStartup` defaults to `true` and now shows the
  flux logo banner with model/directory summary. Remaining: collapse changelog noise on
  first run; keybinding hints still only render when `quietStartup: false` or `--verbose`.
- **TUI polish pass**: tighten headers/status, unify with Claude Code/Codex interaction
  patterns where they win (per `tui-plan.md` constraints).
- **Permission & tool UX**: clearer, faster accept/deny affordances; less ceremony around
  routine file ops.
- **Session/resume ergonomics**: fast resume from shell, terse resume hints.

## Open decisions

1. ~~Keep `pi` bin alias during development?~~ — Removed; Flux now exposes only the `flux` executable.
2. Npm publish identity: `@earendil-works/pi-*` unchanged, or a `flux`-scoped rename?
3. ~~Config dir: migrate `~/.pi` → `~/.flux`?~~ — Fork uses `.flux` from the start; no
   migration (installed pi keeps `~/.pi`). Revisit if flux replaces pi locally.
4. ~~`PI_*` env vars in code~~ — Resolved: Flux runtime and TUI environment variables use
   the `FLUX_*` prefix. The old prefix is no longer read or exported.
5. ~~Update check after the version reset to `0.1.0`~~ — Resolved: skip the upstream
   boot-time update check for rebranded builds. Flux no longer surfaces the upstream
   release channel as an update. The `flux update` self-update command still uses the
   existing installer service; whether to wire that to a Flux release channel is still
   open.

6. ~~Inherited changelog shown at startup?~~ — Resolved: interactive changelog display
   now reads `FLUX_CHANGELOG.md`, so upstream release notes are not presented as Flux
   features.

## Non-goals

- Re-architecting the TUI framework — build on `packages/tui` per `tui-plan.md`.
- Breaking session-file compatibility for existing pi users without a migration path.
- Renaming internal package identifiers before the command surface is complete and green.
