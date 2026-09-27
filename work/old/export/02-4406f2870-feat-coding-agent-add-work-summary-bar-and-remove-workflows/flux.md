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
| Share viewer URL | `pi.dev`, `PI_SHARE_VIEWER_URL` | keep for now | hardcoded default; revisit with identity |

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
such as `─ Worked for 6m 16s ─────────────────`.

**Why:** Make the end of a run visually explicit and expose the total elapsed work time.

**Where:** `packages/coding-agent/src/modes/interactive/interactive-mode.ts` tracks the
`agent_start`/`agent_end` interval; `components/worked-duration.ts` formats and renders
the bar.

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

## Milestone 2+ — Sleekness backlog (sketches)

Tracked here at plan level; each becomes its own detailed doc + PR when started.

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

1. ~~Keep `pi` bin alias during development?~~ — Kept (recommendation adopted); drop at publish.
2. Npm publish identity: `@earendil-works/pi-*` unchanged, or a `flux`-scoped rename?
3. ~~Config dir: migrate `~/.pi` → `~/.flux`?~~ — Fork uses `.flux` from the start; no
   migration (installed pi keeps `~/.pi`). Revisit if flux replaces pi locally.
4. `PI_*` env vars in code (e.g. `PI_OFFLINE`, `PI_SKIP_VERSION_CHECK`,
   `PI_SHARE_VIEWER_URL`): rename to `FLUX_*` with fallback, or alias at the read boundary?
5. ~~Update check after the version reset to `0.1.0`~~ — Resolved: skip pi's
   boot-time update check for rebranded builds. `checkForNewPiVersion` is only invoked
   when `APP_NAME === "pi"`, so flux (and any non-pi binary) never surfaces pi.dev's
   release as an update. The `pi`/`flux update` self-update command still reads pi.dev
   and will report flux as up-to-date/pending against pi's channel; whether to wire
   that to a flux release channel is still open.

## Non-goals

- Re-architecting the TUI framework — build on `packages/tui` per `tui-plan.md`.
- Breaking session-file compatibility for existing pi users without a migration path.
- Renaming internal package identifiers before the command surface is complete and green.
