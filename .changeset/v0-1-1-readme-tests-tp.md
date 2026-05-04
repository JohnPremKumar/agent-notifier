---
'agent-notifier': patch
---

- README: realign "How it works" ASCII diagram (uniform 24-wide boxes, monospace-safe arrow).
- CI: bump unit test timeout to 15s. The first dynamic `await import('../src/...')` per file pays cold module-resolution cost on Windows + Node 20 that occasionally exceeded the 5s default.
- Release: install latest npm in the release job so OIDC Trusted Publishing (requires npm ≥ 11.5.1) works once the trusted publisher is configured on npmjs.com. NPM_TOKEN remains as fallback.
