# Contributing to agent-notifier

## Dev setup

```bash
git clone https://github.com/JohnPremKumar/agent-notifier.git
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

## Coverage scope

Coverage is enforced at 85% lines / branches / functions / statements. Two categories of files are excluded from instrumentation:

- **Barrel `index.ts` re-exports** — no logic, only `export *`.
- **CLI command modules under `packages/cli/src/` (e.g., `logs.ts`, `mute.ts`, `status.ts`, `install.ts`)** — these are tested via integration tests that spawn the built binary as a subprocess (`execFileSync('node', BIN, ...)`). v8 coverage does not instrument subprocess execution, so these would always report 0%. Confidence in these modules comes from the integration test suite, not unit coverage.

The pure-logic core modules (`suppress.ts`, `schedule.ts`, `config.ts`, `logger.ts`, `types.ts`, all adapters) sit at or near 100% line/branch coverage and that is where the bar matters most.

To raise the global lines/functions threshold back to the spec target of 90%, add a CI matrix that runs the full suite on both macOS and Windows — that closes the platform-specific branches in `platform.ts` and `project.ts` which can only execute on their respective OS.

## Adding a new adapter

1. Create `packages/core/src/adapters/<tool>.ts` exporting `classify<Tool>(payload: unknown): Event | null`.
2. Add fixture payloads under `packages/core/tests/fixtures/<tool>/` covering each event kind.
3. Add `packages/core/tests/adapters/<tool>.test.ts` mirroring the existing adapter tests.
4. Register in `packages/core/src/adapters/index.ts`.
5. Add a `<tool>` entry to the `ToolName` enum in `packages/core/src/types.ts`.
6. Add `packages/cli/src/lib/installers/<tool>.ts` and tests; register in `allInstallers()` in `packages/cli/src/install.ts`.
7. Update README support matrix.

## Release smoke checklist

Before publishing a release:

1. **Automated smoke** — run `pnpm test:smoke` (Task 22): verifies the tarball includes bundled icons (`assets/icon.png`, `icon.icns`, `icon.ico`) and exercises the new wizard, project, and reset commands end-to-end.

2. **macOS VM (clean install)**
   - `npm i -g agent-notifier`
   - Run `agnt` with no arguments against a fresh `HOME` directory. Verify the wizard banner reads `agent-notifier — set up` (first-run) and completes without error.
   - Re-run `agnt` in the same `HOME`. Verify the banner reads `agent-notifier — reconfigure` and preselects the currently-wired tools.
   - `agnt doctor` → all test notifications visible.
   - `agnt mute 30s` → notifications suppressed; wait → resumes.
   - `cd` into a git-rooted project, run `agnt project`. Verify the interactive editor saves correctly: `agnt project show` reflects the saved values.
   - `agnt disable` in a git-rooted project → notifications suppressed; check `agnt logs --suppressed --project .` shows `project-disabled`.
   - `agnt schedule add --deny --days $TODAY --from 00:00 --to 23:59 --id all` → all suppressed; `agnt schedule clear` → resumed.
   - `agnt reset --yes` → verify config file is gone, but `~/.agent-notifier/log/` remains intact. Verify each previously-touched dotfile is restored from `.agent-notifier.bak`.
   - `agnt uninstall` → diff every touched dotfile against pre-install backup → byte-identical.

3. **Windows VM** — same checklist.

4. **Real-world session:** start a Claude Code session, run `npm test` (or any 60s+ command), step away, confirm notification arrives within 5s of completion / permission prompt.

If any step fails, fix before publish.
