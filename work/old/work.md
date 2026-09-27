# Flux Agent work summary

## Purpose and direction

Flux was a Pi Agent fork intended to be a quieter, more focused coding-agent CLI with a Codex/Claude Code-inspired terminal UI. Its priorities were low-ceremony startup, concise progress and tool output, clearer work permissions, and a distinct `flux` identity. It retained Pi's provider adapters and coding-agent foundation rather than replacing them.

## Product and identity changes

- Rebranded the command, runtime identity, config directories, environment variables, prompts, notices, and provider attribution for Flux. Flux used `.flux` / `~/.flux` and `FLUX_*` variables so its configuration could coexist with Pi's.
- Reset package versions to `0.1.0`; the package-scope rename was deferred. The cleaner later rebrand snapshot used a `fluxConfig` manifest key and included additional identity changes.
- Quieted startup by default: removed the loaded-resource inventory while retaining resource errors/diagnostics, and added a compact Flux/version, model/effort, and directory header.
- Reworked the default theme toward blue accents, a neutral-gray input surface, stronger menu text, and a blue-to-orange reasoning-effort color ramp.

## Agent capabilities

- **Permission modes:** `auto`, `manual`, and `plan`. Interactive Flux defaults to manual approval; plan mode allows read/search/list tools and `ask_user`, while blocking mutations at execution time. Mode changes preserve the user's configured tool allow/deny sets. RPC disallows manual mode because it has no approval interaction.
- **Read-only shell policy:** replaced a permissive command-prefix check with an allowlist and argument checks, rejecting shell composition and dangerous options (for example `find -exec` and `git branch -D`). Unknown commands require approval.
- **Structured questions:** added an `ask_user` tool, validated question/answer service, interactive picker with custom answers and a review step, cancellation and persistence, plus SDK/RPC request-response support. Non-interactive hosts without a handler return `unavailable` instead of hanging.
- **Delegated agents:** added a supervisor and read-only child agents with bounded task metadata, model inheritance, concurrency/session limits, lifecycle tools, persistence, and `/agents` inspection/actions. Chat tabs can switch between parent and child transcripts; child work remains read-only. Write-capable delegation, nested delegation, and worktree coordination were deferred.
- **Run feedback:** added completed-work duration/token summaries, compact tool-action rows, hidden reasoning by default, an animated working indicator, and an optional terminal attention bell.

## Terminal UI changes

- Replaced the thin input borders with a filled gray prompt block: `›`, display-only “Ask flux anything” placeholder, cursor/mouse offset handling, and a context-pressure hint when space allows. Added a one-shot startup shine and a max-effort color variant.
- Restyled model, effort, and settings selectors around a shared gray surface, concise descriptions, and accent selection markers. `/thinking` became `/effort`; `/mode` became `/work-mode`.
- Tab cycles work modes; Shift-Tab cycles reasoning effort. The old Tab-to-open-file-completion entry point was removed, while autocomplete can still be accepted when its menu is open.
- Hid the footer while autocomplete is open. The footer was made more compact, with mode/model/effort and extension statuses; context pressure moved into the input box.
- Added a floating pulsing working dot and concise tool summaries, while preserving expanded tool output on demand.

## Development history and export

The `export/` tree is a source archive of nine unique Flux commits, with complete touched-file contents (not patches). Its README lists the sequence: fork setup; work-summary bar; question service and agent supervision; shell-allowlist security fix; rename-related test/docs fixes; RPC permission-mode validation; and selector/work-mode revamp. A self-merge duplicated several commits; the export collapses those duplicates.

The inventory describes three distinct snapshots. `openai-alike` contains the features plus a partial rebrand; `Fork-V2` is a later clean rebrand based on upstream and does **not** contain those features; upstream had advanced separately. The inventory recommends starting from the clean rebrand and porting features in dependency order, not copying overlapping files wholesale. In particular, port the TUI primitives, permission policy/security fix, question service, supervisor/session plumbing, RPC/SDK surface, then interactive UI, carrying focused tests alongside each piece.

## Important caveats before reusing the work

- Treat dated customization notes as history, not a guaranteed specification. The export audit found documented-but-unimplemented DeepSeek peak-rate and context-footer behavior, and records later keybinding/command changes that supersede earlier notes.
- The archived branch had stale or contradictory docs/changelog and remaining Pi references. The package README still described features as absent; some environment-variable, release, and menu-style docs were outdated.
- The audit found release scripts and smoke-test paths still shaped around `pi`, upstream service URLs still present, version/lockfile concerns, and an orphaned `.pi/` development config directory after switching to `.flux`. Recheck these against the target fork before release; do not assume the archive is a clean, publish-ready branch.
- The export notes report no GitHub Actions workflows in the archived feature branch. Restore or deliberately replace CI in any maintained fork.
- Some test runs in the historical notes were blocked by unbuilt workspace package entrypoints. Rebuild the relevant workspace packages and rerun targeted tests on the target checkout; the archive's verification statements are not verification of a new port.

## Source documents

This summary consolidates the product/history notes in `flux.md`, harness design and status in `harness-plan.md`, input behavior/design notes in `inputbox.md`, and the commit inventory, port guidance, and audit findings in `export.md` and `export/README.md`.
