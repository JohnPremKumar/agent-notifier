# agent-notifier

## 0.1.1

### Patch Changes

- a40aeee: - README: realign "How it works" ASCII diagram (uniform 24-wide boxes, monospace-safe arrow).
  - CI: bump unit test timeout to 15s. The first dynamic `await import('../src/...')` per file pays cold module-resolution cost on Windows + Node 20 that occasionally exceeded the 5s default.
  - Release: switch publishing to npm OIDC Trusted Publishing. Bumped `packageManager` to `pnpm@10.33.2` (pnpm ≥ 10.16 is required for OIDC support inside `pnpm publish`). Dropped `NPM_TOKEN`/`NODE_AUTH_TOKEN` env wiring from the release workflow — there is no static publish token anymore; each release exchanges a short-lived GitHub OIDC token with npm at publish time. Provenance attestations remain on.

## 0.1.0

### Minor Changes

- 6caa6c6: Initial release: cross-platform desktop notifications for Claude Code, Codex, Gemini CLI, and OpenCode. Includes install/uninstall/doctor, enable/disable per global/tool/project, mute with natural-language durations, schedule allow/deny windows, status TUI, filtered logs, and interactive init.

### Patch Changes

- Updated dependencies [6caa6c6]
  - @agent-notifier/core@0.1.0
