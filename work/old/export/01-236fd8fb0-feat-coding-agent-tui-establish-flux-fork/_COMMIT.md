# 236fd8fb0 — feat(coding-agent,tui): establish flux fork

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-09 17:32:43 +0200
Commit: 236fd8fb095946a6ceef2b0a5273f50c64cc501c
```

> feat(coding-agent,tui): establish flux fork
> Rebrand and customize the pi fork as flux:
> - Rebrand via piConfig (flux name, .flux config dir, bin); reset lockstep version to 0.1.0
> - Quiet startup by default with a flux wordmark banner (model + directory summary)
> - Hide the status bar while the /-command menu is open
> - Gate the pi.dev update notice behind APP_NAME === "pi"
> - Theme rework: blue accent, bold menus, gray-to-blue-to-fiery-red thinking-effort ramp,
>   and a footer effort label colored to match the effort bar

## Files

- `M` AGENTS.md
- `A` flux.md
- `M` package-lock.json
- `M` packages/agent/package.json
- `M` packages/ai/package.json
- `M` packages/chord/package.json
- `M` packages/client/package.json
- `M` packages/coding-agent/examples/extensions/custom-provider-anthropic/package.json
- `M` packages/coding-agent/examples/extensions/custom-provider-gitlab-duo/package.json
- `M` packages/coding-agent/examples/extensions/gondolin/package.json
- `M` packages/coding-agent/examples/extensions/with-deps/package.json
- `M` packages/coding-agent/install-lock/package-lock.json
- `M` packages/coding-agent/install-lock/package.json
- `M` packages/coding-agent/npm-shrinkwrap.json
- `M` packages/coding-agent/package.json
- `M` packages/coding-agent/src/core/settings-manager.ts
- `M` packages/coding-agent/src/modes/interactive/components/footer.ts
- `M` packages/coding-agent/src/modes/interactive/interactive-mode.ts
- `M` packages/coding-agent/src/modes/interactive/theme/dark.json
- `M` packages/coding-agent/src/modes/interactive/theme/light.json
- `M` packages/coding-agent/src/modes/interactive/theme/theme-json.ts
- `M` packages/coding-agent/src/modes/interactive/theme/theme-schema.json
- `M` packages/coding-agent/src/modes/interactive/theme/theme.ts
- `M` packages/evals/package.json
- `M` packages/protocol/package.json
- `M` packages/server/package.json
- `M` packages/session-backends/sqlite-node/package.json
- `M` packages/telemetry/package.json
- `M` packages/tui/package.json
- `M` packages/tui/src/autocomplete.ts
- `M` packages/tui/src/components/editor.ts
- `M` packages/tui/src/components/select-list.ts
- `M` packages/tui/src/editor-component.ts
- `M` packages/tui/test/editor.test.ts
