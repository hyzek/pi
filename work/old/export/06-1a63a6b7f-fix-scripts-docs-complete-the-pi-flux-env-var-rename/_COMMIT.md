# 1a63a6b7f — fix(scripts,docs): complete the pi->flux env var rename

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-20 19:33:54 +0200
Commit: 1a63a6b7f34e57e046aa39c5aa7887de7016f6d6
```

> fix(scripts,docs): complete the pi->flux env var rename
> These still referenced the old PI_* variables, which the runtime no longer
> reads, so the documented behaviour silently did nothing:
> - mini-test.sh read FLUX_AGENT_DIR; the override is FLUX_CODING_AGENT_DIR,
>   so --fresh/--stop never removed the configured server socket.
> - auto-pi.sh exported PI_EXPERIMENTAL; experimental.ts reads
>   FLUX_EXPERIMENTAL, so the dev wrapper stopped enabling experimental
>   features.
> - tui docs advertised PI_TUI_WRITE_LOG; terminal.ts reads
>   FLUX_TUI_WRITE_LOG.
> - development.md advertised PI_SERVER_DIR/PI_SERVER_ID; server.ts reads
>   FLUX_SERVER_DIR/FLUX_SERVER_ID.
> Co-Authored-By: Claude Code <noreply@anthropic.com>

## Files

- `M` mini-test.sh
- `M` packages/coding-agent/docs/development.md
- `M` packages/coding-agent/docs/tui.md
- `M` packages/coding-agent/examples/plugins/pi-example-plugin/README.md
- `M` packages/tui/README.md
- `M` scripts/auto-pi.sh
