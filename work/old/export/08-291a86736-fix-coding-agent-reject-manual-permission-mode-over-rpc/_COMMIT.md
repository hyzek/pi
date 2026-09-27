# 291a86736 — fix(coding-agent): reject manual permission mode over RPC

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-20 19:37:21 +0200
Commit: 291a8673677b59d36bd91f0a3f3bef3119b4069c
```

> fix(coding-agent): reject manual permission mode over RPC
> RPC accepted `set_permission_mode: manual`, but the runtime never installs
> a ToolCallApprovalHandler (the only call site is interactive mode) and the
> protocol defines no approval request/response pair. Switching an RPC
> session to manual therefore blocked every mutating tool with "no approval
> handler is available" and no way for the host to approve it.
> Reject the mode instead of accepting it into a dead end, and narrow the
> client signature so hosts get a compile error rather than a runtime one.
> The rule lives in isRpcSettablePermissionMode so it is unit testable
> without spawning a CLI.
> Co-Authored-By: Claude Code <noreply@anthropic.com>

## Files

- `M` packages/coding-agent/src/modes/rpc/rpc-client.ts
- `M` packages/coding-agent/src/modes/rpc/rpc-mode.ts
- `M` packages/coding-agent/src/modes/rpc/rpc-types.ts
- `A` packages/coding-agent/test/rpc-permission-mode.test.ts
