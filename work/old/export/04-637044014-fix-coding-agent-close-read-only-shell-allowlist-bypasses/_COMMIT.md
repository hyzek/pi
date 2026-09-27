# 637044014 — fix(coding-agent): close read-only shell allowlist bypasses

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-20 19:33:54 +0200
Commit: 637044014d21d26c481c3e5d083bf0182471a895
```

> fix(coding-agent): close read-only shell allowlist bypasses
> The manual permission policy auto-approved shell commands by matching a
> prefix allowlist against the command string. Any allowlisted command that
> can execute another program therefore passed as read-only:
> - `env rm -rf dist` (env runs its arguments)
> - `find . -exec rm -rf {} +` and `find . -delete`
> - `git branch -D main` (the optional --show-current group matched empty)
> - `sed -n '1e ...'` and `awk -f script` (script files)
> Replace the prefix regex with an allowlist of commands that stay read-only
> for every argument, plus explicit argument guards for `git`, `find`, `rg`
> and `sort`. Commands that can execute or write through an option or script
> file (`env`, `sed`, `awk`, `tree`, `uniq`) now fall through to manual
> approval. Unknown commands, subcommands and options fail closed.
> Co-Authored-By: Claude Code <noreply@anthropic.com>

## Files

- `M` packages/coding-agent/src/core/permission-mode.ts
- `M` packages/coding-agent/test/permission-mode.test.ts
