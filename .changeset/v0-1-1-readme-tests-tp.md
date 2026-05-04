---
'agent-notifier': patch
---

- README: realign "How it works" ASCII diagram (uniform 24-wide boxes, monospace-safe arrow).
- CI: bump unit test timeout to 15s. The first dynamic `await import('../src/...')` per file pays cold module-resolution cost on Windows + Node 20 that occasionally exceeded the 5s default.
- Release: switch publishing to npm OIDC Trusted Publishing. Bumped `packageManager` to `pnpm@10.33.2` (pnpm ≥ 10.16 is required for OIDC support inside `pnpm publish`). Dropped `NPM_TOKEN`/`NODE_AUTH_TOKEN` env wiring from the release workflow — there is no static publish token anymore; each release exchanges a short-lived GitHub OIDC token with npm at publish time. Provenance attestations remain on.
