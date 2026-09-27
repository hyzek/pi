# f544c2086 — chore: sync lockfile with the flux bin rename

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-20 19:33:54 +0200
Commit: f544c2086fe2bc6859303479e9be898807316319
```

> chore: sync lockfile with the flux bin rename
> package.json exposes only the `flux` bin while package-lock.json still
> declared `pi`, which can break `npm ci`. Regenerated with `npm install`.
> Co-Authored-By: Claude Code <noreply@anthropic.com>

## Files

- `M` package-lock.json
