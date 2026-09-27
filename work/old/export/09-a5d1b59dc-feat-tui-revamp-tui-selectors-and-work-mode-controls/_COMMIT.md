# a5d1b59dc — feat(tui): revamp TUI selectors and work-mode controls

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-22 16:52:24 +0200
Commit: a5d1b59dc361b7eb669f9c8c5c84799616319a86
```

> feat(tui): revamp TUI selectors and work-mode controls

## Files

- `R` pi-test.bat -> flux-test.bat
- `R` pi-test.ps1 -> flux-test.ps1
- `R` pi-test.sh -> flux-test.sh
- `M` flux.md
- `M` inputbox.md
- `M` packages/ai/scripts/generate-models.ts
- `M` packages/coding-agent/docs/docs.json
- `M` packages/coding-agent/docs/index.md
- `M` packages/coding-agent/docs/keybindings.md
- `A` packages/coding-agent/docs/menu-style.md
- `M` packages/coding-agent/docs/quickstart.md
- `M` packages/coding-agent/docs/settings.md
- `M` packages/coding-agent/docs/usage.md
- `M` packages/coding-agent/src/cli/session-picker.ts
- `M` packages/coding-agent/src/core/keybindings.ts
- `M` packages/coding-agent/src/core/permission-mode.ts
- `M` packages/coding-agent/src/core/settings-manager.ts
- `M` packages/coding-agent/src/core/slash-commands.ts
- `M` packages/coding-agent/src/modes/interactive/components/custom-editor.ts
- `M` packages/coding-agent/src/modes/interactive/components/footer.ts
- `M` packages/coding-agent/src/modes/interactive/components/model-selector.ts
- `M` packages/coding-agent/src/modes/interactive/components/session-selector.ts
- `M` packages/coding-agent/src/modes/interactive/components/settings-selector.ts
- `M` packages/coding-agent/src/modes/interactive/components/status-indicator.ts
- `M` packages/coding-agent/src/modes/interactive/components/thinking-selector.ts
- `M` packages/coding-agent/src/modes/interactive/interactive-mode.ts
- `A` packages/coding-agent/src/modes/interactive/model-description.ts
- `M` packages/coding-agent/src/modes/interactive/theme/dark.json
- `A` packages/coding-agent/src/modes/interactive/theme/input-shine.ts
- `M` packages/coding-agent/src/modes/interactive/theme/theme.ts
- `A` packages/coding-agent/src/modes/interactive/thinking-levels.ts
- `M` packages/coding-agent/test/footer-width.test.ts
- `A` packages/coding-agent/test/input-shine.test.ts
- `M` packages/coding-agent/test/keybindings.test.ts
- `M` packages/coding-agent/test/model-selector.test.ts
- `M` packages/coding-agent/test/permission-mode.test.ts
- `A` packages/coding-agent/test/session-selector-style.test.ts
- `M` packages/coding-agent/test/suite/regressions/3217-scoped-model-order.test.ts
- `M` packages/coding-agent/test/suite/regressions/7209-model-selector-filter-resets-selection.test.ts
- `M` packages/coding-agent/test/thinking-selector.test.ts
- `M` packages/tui/src/components/editor.ts
- `M` packages/tui/src/index.ts
- `A` packages/tui/src/shine.ts
- `M` packages/tui/test/editor.test.ts
- `A` packages/tui/test/shine.test.ts
