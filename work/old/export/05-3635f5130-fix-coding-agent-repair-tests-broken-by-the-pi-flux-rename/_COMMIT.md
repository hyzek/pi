# 3635f5130 — fix(coding-agent): repair tests broken by the pi->flux rename

```
Author: flux <95105632+hyzek@users.noreply.github.com>
Date:   2026-09-20 19:33:54 +0200
Commit: 3635f5130b00c7e7a99d8bc8b5c1fa6ccfaf8ab2
```

> fix(coding-agent): repair tests broken by the pi->flux rename
> The branding sweep was applied inconsistently and left these two suites
> failing:
> - radius.test.ts asserted the gateway https://radius.flux.dev, but
>   DEFAULT_RADIUS_GATEWAY is still https://radius.pi.dev, so the fetch
>   lookup returned undefined and toMatchObject failed. Revert the
>   expectation to the real endpoint.
> - sdk-openrouter-attribution.test.ts still expected the old attribution
>   values; provider-attribution.ts sends flux / Flux / flux.
> Verified: 7 tests failed before, 19 pass after.
> Co-Authored-By: Claude Code <noreply@anthropic.com>

## Files

- `M` packages/coding-agent/test/radius.test.ts
- `M` packages/coding-agent/test/sdk-openrouter-attribution.test.ts
