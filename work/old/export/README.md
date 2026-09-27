# Fork commit export

Full source of every commit on this branch that is **not** upstream Pi Agent
work, extracted from `6160683a4..HEAD`.

Each directory holds the complete content of every file that commit touched,
as of that commit — not a diff. Files the commit **deleted** are preserved
under `_removed/` for reference and are not live code.

Duplicate commits introduced by the self-merge `d546ca7af` are collapsed,
keeping the earliest instance of each. See §2 of `../export.md`.

| # | Commit | Subject | Files |
|---|---|---|---|
| 1 | `236fd8fb0` | feat(coding-agent,tui): establish flux fork | 34 (1A 33M 0D) |
| 2 | `4406f2870` | feat(coding-agent): add work summary bar and remove workflows | 14 (1A 3M 10D) |
| 3 | `fe435726a` | feat(ai,coding-agent,tui): add question service and agent supervision | 215 (20A 195M 0D) |
| 4 | `637044014` | fix(coding-agent): close read-only shell allowlist bypasses | 2 (0A 2M 0D) |
| 5 | `3635f5130` | fix(coding-agent): repair tests broken by the pi->flux rename | 2 (0A 2M 0D) |
| 6 | `1a63a6b7f` | fix(scripts,docs): complete the pi->flux env var rename | 6 (0A 6M 0D) |
| 7 | `f544c2086` | chore: sync lockfile with the flux bin rename | 1 (0A 1M 0D) |
| 8 | `291a86736` | fix(coding-agent): reject manual permission mode over RPC | 4 (1A 3M 0D) |
| 9 | `a5d1b59dc` | feat(tui): revamp TUI selectors and work-mode controls | 45 (8A 37M 0D) |

---

Regenerate with `scripts/export-fork-commits.sh`.
