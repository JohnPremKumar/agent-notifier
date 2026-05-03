# agent-notifier — CLAUDE.md

Cross-platform desktop notifier for AI coding CLIs. Hooks into Claude Code, Codex, Gemini CLI, and OpenCode and pings the user on macOS or Windows when a session needs attention — permission, idle 60s, turn done. One install, every agent, every machine.

## Working Rules

- **Think first** — state assumptions, surface tradeoffs, ask when unclear.
- **Minimum code** — no features beyond the ask, no speculative flexibility, no error handling for impossible cases.
- **Surgical edits** — every changed line traces to the request; flag pre-existing dead code, don't delete it.
- **Goal-driven** — restate the task as a verifiable success criterion before coding.
- **Cross-platform always** — every change works on macOS and Windows. If a path is OS-specific, the other OS gets an equivalent test or a documented manual smoke step.

## Tech Stack (locked — do not propose alternatives)

| Layer | Choice |
|---|---|
| Language / runtime | TypeScript strict, Node ≥ 20 LTS (CI: 20.x + 22.x) |
| Package manager | pnpm + workspaces (`packages/core`, `packages/cli`) |
| Notifications | `node-notifier` (bundles `alerter` mac, `SnoreToast` win) |
| CLI | `commander` — subcommands `install`, `uninstall`, `doctor`, `hook` |
| Build / test / lint | `tsup` · Vitest · ESLint + Prettier |
| Release / CI | Changesets → npm; GitHub Actions matrix `{os: [macos, windows], node: [20, 22]}` |
| Validation | `zod` at every external-input boundary (hook payloads, config files) |

## Skill Routing (auto-trigger, gates mandatory)

| Doing this | Skill | Source |
|---|---|---|
| Speccing an adapter, hook integration, CLI command, or platform behavior | `brainstorming` | superpowers |
| **Gate 1** — every plan, before `writing-plans` | `plan-eng-review` (iterate until passes) | gstack |
| Writing any implementation plan | `writing-plans` | superpowers |
| Building anything in TS/Node | `subagent-driven-development` + `test-driven-development` | superpowers |
| Writing tests | `test-driven-development` (RED → GREEN → REFACTOR) | superpowers |
| Any bug | `systematic-debugging` (4 phases) | superpowers |
| **Gate 2** — every plan, after execution | `review` (fix every finding before DONE) | gstack |
| Before claiming DONE | `verification-before-completion` | superpowers |
| Before opening a PR | `review` + `cso` (we ship a globally-installed CLI that writes user dotfiles — supply chain matters) | gstack |
| After publishing a release | manual cross-OS smoke checklist (`docs/CONTRIBUTING.md#release-smoke`) | manual |
| Architecture / codebase question | read `graphify-out/GRAPH_REPORT.md` first | graphify |

After modifying source: `graphify update .`. After every gstack run, symlink new `~/.gstack/` files into `docs/gstack/` mirroring subpaths. **No frontend skills** — no UI surface in v1.

## Quality Bar

A globally-installed CLI wired into user dotfiles is a trust contract. Non-negotiable: cross-platform parity, zero-noise install, idempotent install, safe uninstall (only removes lines we wrote, restores from `.agent-notifier.bak`), `doctor` covers 90% of bug reports, every notification logged with rotation.

**Anti-patterns (build errors):** `any`, untyped JSON parsing, `as` without justification comment, generic `catch`, OS-specific code outside an adapter or `platform.ts`, hard-coded paths, calling `node-notifier` from anywhere except `notify.ts`, editing user dotfiles without a backup, blocking I/O > 500 ms p99 in the hook hot path.

## Architecture

```
packages/
  core/src/
    classify.ts            # adapter dispatch + zod-validated Event
    notify.ts              # ONLY caller of node-notifier (chokepoint)
    idle-gate.ts           # mac: ioreg HIDIdleTime; win: GetLastInputInfo via PowerShell
    logger.ts              # size-based rotation, 1 MB × 3 generations, env-tunable
    platform.ts            # OS detection + canonical paths
    adapters/{claude-code,codex,gemini,opencode}.ts
  cli/src/
    index.ts install.ts uninstall.ts doctor.ts hook.ts
docs/{superpowers/specs,adapters,CONTRIBUTING.md}
.github/workflows/{ci.yml,release.yml}
```

**Adapter contract:** `export function classify(payload: unknown): Event | null` — never throws, returns `null` for unmapped events. **Single notify chokepoint:** all dispatch flows through `core/notify.ts`; idle-gating, sound selection, logging applied there. **Backup before edit:** every write to `~/.claude/settings.json`, `~/.codex/config.toml`, etc. copies to `<file>.agent-notifier.bak` first; `uninstall` restores. **Config dir:** `~/.agent-notifier/` (mac) / `%APPDATA%\agent-notifier\` (win), subdirs `log/`, `state/`, `backups/`.

For codebase questions, read `graphify-out/GRAPH_REPORT.md` before raw files.

## Testing

Every function → unit. Every adapter → fixture-driven from `tests/fixtures/<tool>/`. Every CLI command → integration (spawn binary, mock `node-notifier` via `--notify-impl=stub`). Every bug fix → regression test before the fix. Coverage bar: 90% lines, 85% branches. CI matrix all 4 jobs green to merge.

`pnpm test` · `test:unit` · `test:integration` · `test:coverage` · `test:smoke` (local only, fires real notifications).

## Code Style

TypeScript strict, no `any`, no `as` without a justifying comment. Named exports only. Comments explain **why**. `try/catch` with specific error types — generic catch is a build error. External JSON parsed through `zod` at the boundary.

## Git

Branches: `feature/<n>`, `fix/<n>`, `docs/<n>`, `adapter/<tool>`. Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Changesets entry on any user-facing change. Never commit npm tokens or captured user dotfiles. Never `--force`, `reset --hard`, or `stash`.

## Commands

`pnpm install` · `pnpm dev` · `pnpm test` · `pnpm lint` · `pnpm build` · `pnpm changeset` · `graphify update .`.

## Completion Reporting

End every workflow with: **DONE** (evidence) / **DONE_WITH_CONCERNS** / **BLOCKED** / **NEEDS_CONTEXT**.

## Boil the Lake

Marginal cost of AI work is near-zero. Always finish the last 10% — edge cases, tests, both-OS coverage, doctor diagnostics, README screenshots from both platforms. No skeletons, no "Windows support coming soon."
