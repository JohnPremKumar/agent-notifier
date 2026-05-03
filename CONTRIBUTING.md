# Contributing to agent-notifier

## Dev setup

```bash
git clone <repo>
cd agent-notifier
pnpm install
pnpm test
```

## Workflow

1. Branch: `feature/<slug>` or `fix/<slug>` or `adapter/<tool>`.
2. TDD: write the failing test, then the minimal code to pass it, then commit.
3. Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`.
4. Add a changeset entry: `pnpm changeset` (skip only for non-user-facing chore commits).
5. CI must pass on macOS-latest + windows-latest × Node 20 + 22 before merge.

## Adding a new adapter

1. Create `packages/core/src/adapters/<tool>.ts` exporting `classify<Tool>(payload: unknown): Event | null`.
2. Add fixture payloads under `packages/core/tests/fixtures/<tool>/` covering each event kind.
3. Add `packages/core/tests/adapters/<tool>.test.ts` mirroring the existing adapter tests.
4. Register in `packages/core/src/adapters/index.ts`.
5. Add a `<tool>` entry to the `ToolName` enum in `packages/core/src/types.ts`.
6. Add `packages/cli/src/lib/installers/<tool>.ts` and tests; register in `allInstallers()` in `packages/cli/src/install.ts`.
7. Update README support matrix.

## Release smoke

Before publishing a release:

1. **macOS VM (clean install)**
   - `npm i -g agent-notifier`
   - `agent-notifier install` → `init` → `doctor` → all three test notifications visible.
   - `mute 30s` → notifications suppressed; wait → resumes.
   - `disable` in a git-rooted project → notifications suppressed; check `logs --suppressed --project .` shows `project-disabled`.
   - `schedule add --deny --days $TODAY --from 00:00 --to 23:59 --id all` → all suppressed; `schedule clear` → resumed.
   - `uninstall` → diff every touched dotfile against pre-install backup → byte-identical.
2. **Windows VM** — same checklist.
3. **Real-world session:** start a Claude Code session, run `npm test` (or any 60s+ command), step away, confirm notification arrives within 5s of completion / permission prompt.

If any step fails, fix before publish.
