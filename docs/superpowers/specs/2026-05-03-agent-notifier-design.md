# agent-notifier — Design Spec

**Date:** 2026-05-03
**Status:** Approved (pending user spec review)
**Author:** Johnpremkumar + Claude

## Summary

A cross-platform desktop notifier for AI coding CLIs. Hooks into Claude Code, OpenAI Codex, Gemini CLI, and OpenCode and pings the user on macOS or Windows when a session needs attention — permission requests, idle prompts (60s+ waiting for input), or finished turns.

Distributed as a single npm package: `npm i -g agent-notifier && agent-notifier install` auto-detects every supported CLI on the machine and wires up its hook system. One install, every agent, every machine.

## Goals

- **Don't miss a blocked session.** When you step away during a multi-minute task and Claude/Codex/Gemini stops to ask for permission, you find out within seconds, not when you happen to glance back.
- **Distinguish urgency.** Permission requests (genuinely blocking) get a sticky "Alert"-style notification with an urgent sound. Idle and turn-done are dismissable banners with softer sounds.
- **Cross-tool, cross-platform parity.** Same install, same UX whether you use Claude Code on macOS or Codex on Windows.
- **Trustworthy by default.** Silent install, idempotent, safe uninstall, never edits user dotfiles without a backup, no telemetry, no network calls beyond `npm install`.
- **Control without configuration spelunking.** Per-project enable/disable, global toggle, time-bounded mute, weekly schedules (allow/deny windows), and rich log filtering — all via first-class CLI commands. Users never hand-edit JSON.
- **Self-explaining state.** `agent-notifier status` shows exactly what's configured, what's currently active, why the last few notifications fired or were suppressed. "Why didn't I get a ping?" is answerable in one command.

## Non-Goals (v1)

- Linux support. Stretch goal once macOS + Windows ship and stabilize.
- Per-tab terminal focus. Ghostty (and most modern terminals) lack the AppleScript surface to focus a specific tab from outside; we'll bring the terminal app forward and put the project name in the notification body.
- Mobile / push notifications. macOS/Windows local Notification Center only.
- Long-running task notifications. Decided against — overlaps with the `Stop` event and creates noise. May revisit if users ask.
- Aider, Cursor, GitHub Copilot. Aider already has built-in notifications (`--notifications`); Cursor/Copilot are IDE-internal and don't expose a hook surface.

## Triggers (the only three events we notify on)

| Event kind | What it means | Default sound | Notification style |
|---|---|---|---|
| `PERMISSION` | Agent is blocked, asking the user to approve a tool call | `Sosumi` (mac) / `ms-winsoundevent:Notification.Looping.Alarm` (win) | **Sticky alert** (stays until dismissed) |
| `IDLE` | Prompt has been idle ≥ 60s waiting for the user's next message | `Tink` (mac) / `ms-winsoundevent:Notification.Default` (win) | Banner (auto-dismiss) |
| `TURN_DONE` | Agent finished its turn; ball is in the user's court | `Glass` (mac) / `ms-winsoundevent:Notification.IM` (win) | Banner (auto-dismiss) |

**Idle gate (default ON, env-overridable).** Before firing, check macOS `HIDIdleTime` (via `ioreg`) or Windows `GetLastInputInfo` (via PowerShell shell-out). If user has touched mouse/keyboard in the last **30s**, suppress the notification — they're obviously at the machine.

Override knobs:
- `AGENT_NOTIFIER_ALWAYS=1` — disable idle gating entirely
- `AGENT_NOTIFIER_IDLE_THRESHOLD=10` — tune the seconds threshold
- `PERMISSION` events **bypass the gate** unconditionally — too important to suppress.

**Click action.** Notification activates the agent's host terminal app (best-effort: `com.mitchellh.ghostty`, iTerm, Windows Terminal, etc., based on what the user configures via `AGENT_NOTIFIER_TERMINAL_BUNDLE_ID`).

## Tool Adapters

Each adapter exports a single function:
```ts
export function classify(payload: unknown): Event | null
```
Returns a normalized `Event` or `null`. Never throws — invalid payloads log a warning and return `null`.

```ts
type Event = {
  kind: "PERMISSION" | "IDLE" | "TURN_DONE";
  tool: "claude-code" | "codex" | "gemini" | "opencode";
  project: string;     // basename(cwd) + 6-char session-id suffix if collision
  sessionId: string;
  message?: string;    // body text snippet
  cwd: string;
};
```

### Claude Code adapter
- **Mechanism:** `~/.claude/settings.json` `hooks` field. We register on `Notification`, `Stop`. Hook script receives JSON on stdin.
- **Mapping:**
  - `Notification` event, `message` matches `/permission/i` → `PERMISSION`
  - `Notification` event, `message` matches `/waiting.*input/i` → `IDLE`
  - `Stop` event → `TURN_DONE`
- **Install action:** merge our entries into the existing `hooks` array (idempotent — detect by `command` field containing `agent-notifier`). Backup file to `~/.claude/settings.json.agent-notifier.bak` before write.

### OpenAI Codex CLI adapter
- **Mechanism:** Codex `hooks` config (TOML) — `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`. We register on `PermissionRequest` and `Stop`. Idle is covered by Codex's own notification system (TUI), but we'll also subscribe if a `Notification`-like event surfaces in the hooks.
- **Mapping:**
  - `PermissionRequest` event → `PERMISSION`
  - `Stop` event → `TURN_DONE`
  - Idle: deferred unless Codex exposes a hook event for it (currently only the deprecated `notify` mechanism); document as "Codex idle not covered in v1, use Codex's own TUI notification."
- **Install action:** modify `~/.codex/config.toml`, backup first, idempotent.

### Gemini CLI adapter
- **Mechanism:** `~/.gemini/settings.json` (v0.26.0+). Register on `Notification`. Hook receives JSON on stdin (same shape pattern as Claude Code), must respond with valid JSON on stdout.
- **Mapping:**
  - `Notification` event with idle indication → `IDLE`
  - `Notification` event with tool-confirmation indication → `PERMISSION`
  - `AfterAgent` event → `TURN_DONE` (Gemini's equivalent of Claude's `Stop`)
- **Install action:** merge into Gemini settings, backup first, idempotent. **Strict stdout discipline** — Gemini hooks must emit only the response JSON; logging goes to stderr.

### OpenCode adapter (different shape — JS plugin, not stdin hook)
- **Mechanism:** Drop a small JS plugin file into the OpenCode plugins directory. The plugin subscribes to OpenCode's event bus (SSE-backed), and on each relevant event it invokes the same `agent-notifier hook --tool opencode` binary, piping the event JSON via stdin — keeping the chokepoint identical to the other adapters.
- **Mapping:**
  - `permission.requested` → `PERMISSION`
  - `session.completed` → `TURN_DONE`
  - `idle` (if exposed) → `IDLE`; deferred otherwise
- **Install action:** write plugin file to OpenCode's plugin dir, no settings file edits needed.

### Adapter risk note
Adapter selection happens once in `cli/hook.ts` based on the `--tool` flag passed in the hook command line. The flag is set by `install` when wiring up each tool, so misrouting is impossible at runtime.

## Management Layer

Users control the notifier through CLI commands, never by hand-editing config. State lives in a single zod-validated JSON file; suppression decisions are pure functions over `(config, now, event)`.

### Config file

Path: `~/.agent-notifier/config.json` (mac) / `%APPDATA%\agent-notifier\config.json` (win). Example:

```jsonc
{
  "version": 1,
  "tz": "Asia/Kolkata",                          // user's timezone, captured at init
  "global": { "enabled": true },
  "mute": { "until": "2026-05-03T17:00:00Z" } | null,
  "schedules": [
    {
      "id": "work-hours",
      "type": "allow",                            // "allow" = only fire during; "deny" = quiet hours
      "days": ["mon","tue","wed","thu","fri"],
      "from": "09:00", "to": "18:00"
    }
  ],
  "tools": {
    "claude-code": { "enabled": true },
    "codex":       { "enabled": true },
    "gemini":      { "enabled": true },
    "opencode":    { "enabled": true }
  },
  "projectDefault": { "enabled": true },          // applied when a project has no entry
  "projects": {
    "/Users/john/Desktop/Education/grind/notifier": { "enabled": false },
    "/Users/john/work/elakio":                     { "enabled": true, "kinds": ["PERMISSION"] }
  }
}
```

Writes are atomic (`tmp + fsync + rename`) and zod-validated. A schema-version bump triggers a one-shot migration with a `.bak` copy.

### Project identification

Walk up from `event.cwd` looking for a `.git` directory. If found, the project key is that path (so subfolders of the same repo share state). Otherwise, fall back to `event.cwd` itself. Display name in the notification body remains `basename(projectKey)`. The walk is cached per-process for the duration of one hook invocation.

### Schedule semantics

Schedule rules combine into an effective state via this rule (in `core/schedule.ts`, pure):

```
state(now, schedules):
  let activeAllows = schedules.filter(s => s.type === "allow" && matches(s, now))
  let activeDenies = schedules.filter(s => s.type === "deny"  && matches(s, now))
  if activeDenies.length > 0:           return "deny"           // any deny window in effect → suppress
  if anyAllows = schedules.some(s => s.type === "allow"):
      return activeAllows.length > 0 ? "allow" : "deny"         // allows exist but none active → suppress
  return "neutral"                                                // no schedules → notify normally
```

`matches(rule, now)` evaluates day-of-week (in `tz`) and time window. Windows that cross midnight (`from: 22:00, to: 06:00`) are supported.

### Suppression decision tree (in `core/suppress.ts`)

Evaluated in order; first non-null reason wins. Pure function `(config, now, event, idleSeconds) → { fire: boolean, reason?: string }`:

1. `!global.enabled` → suppress, reason `"global-disabled"`
2. `mute && mute.until > now` → suppress, reason `"muted-until-X"`
3. schedule state is `"deny"` → suppress, reason `"schedule-deny"`
4. `!tools[event.tool].enabled` → suppress, reason `"tool-disabled"`
5. project entry: `enabled === false` → suppress; or `kinds` set and `event.kind ∉ kinds` → suppress, reason `"project-filter"`
6. `event.kind !== "PERMISSION" && idleSeconds < idleThreshold` → suppress, reason `"user-active"`
7. otherwise → `{ fire: true }`

Every suppression writes a log line with the reason, so `agent-notifier logs --suppressed` and `agent-notifier status` can explain "why didn't I get a ping?"

### Onboarding (`agent-notifier init`)

Interactive setup using `@inquirer/prompts`. Runs automatically on first install, or manually anytime to reconfigure. Flow:

1. **Detect tools.** Show what's installed; ask which to wire up (multi-select, defaults to all detected).
2. **Timezone.** Auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`; ask to confirm.
3. **Work hours.** "Notify only during work hours? (Y/n)" → if yes, prompt days + from/to; creates an `allow` schedule.
4. **New project default.** "When you start using a new project, default to enabled or disabled?" → sets `projectDefault.enabled`.
5. **Test notifications.** Fire one of each kind; user confirms reception (Y/n per kind).
6. **Save & summarize.** Write config, print "Done. Use `agent-notifier status` anytime to see current state."

`agent-notifier install` is the headless variant: wire hooks with sensible defaults, no prompts. `init` is the interactive variant.

### Logs as the management substrate

Log entries already carry `tool`, `kind`, `project`, `sessionId`, `ts`, plus `suppressed?` and `suppressReason?` fields populated by the decision tree. The `logs` command is pure post-hoc filtering over the rotating JSONL files — no schema changes, no separate per-project files.

`logs` filter flags:

- `--project PATH` — defaults to current git-root if PATH omitted; matches `project ===` after resolving PATH to its git-root.
- `--tool {claude-code|codex|gemini|opencode}` — repeatable.
- `--kind {PERMISSION|IDLE|TURN_DONE}` — repeatable.
- `--suppressed` / `--fired` — only suppressed or only fired entries.
- `--since DURATION` — `1h`, `30m`, `1d`, `today`, `yesterday`, or ISO timestamp.
- `--tail N` — last N matching entries (default 50).
- `--follow` — `tail -f` semantics.
- `--json` — raw JSONL output for piping into `jq`.

## Architecture

```
agent-notifier (pnpm workspace root)
├── packages/
│   ├── core/                                 # platform- and tool-agnostic
│   │   └── src/
│   │       ├── classify.ts                   # dispatch to adapter, validate Event
│   │       ├── notify.ts                     # Event → node-notifier (single chokepoint)
│   │       ├── suppress.ts                   # pure decision tree (config, now, event, idle) → fire?
│   │       ├── schedule.ts                   # pure schedule evaluator (rules, now) → allow|deny|neutral
│   │       ├── config.ts                     # zod-validated read/write of config.json (atomic)
│   │       ├── project.ts                    # cwd → git-root resolution, cached
│   │       ├── idle-gate.ts                  # cross-platform user-idle check
│   │       ├── logger.ts                     # rotating file logger (size-based)
│   │       ├── platform.ts                   # OS detection + canonical paths
│   │       └── adapters/
│   │           ├── claude-code.ts
│   │           ├── codex.ts
│   │           ├── gemini.ts
│   │           └── opencode.ts               # also emits the plugin .js file
│   └── cli/
│       └── src/
│           ├── index.ts                      # commander dispatch
│           ├── init.ts                       # interactive onboarding (@inquirer/prompts)
│           ├── install.ts                    # headless wiring of hooks (atomic, with backup)
│           ├── uninstall.ts                  # restore from .bak files
│           ├── doctor.ts                     # diagnose + fire test notifications
│           ├── status.ts                     # pretty TUI: global, mute, schedules, tools, current project, recent logs
│           ├── enable.ts                     # --global | --project [PATH] | --tool TOOL
│           ├── disable.ts                    # mirror of enable
│           ├── mute.ts                       # mute <duration> | unmute
│           ├── schedule.ts                   # list | add --allow|--deny --days … --from … --to … | remove <id>
│           ├── logs.ts                       # filtered tail over rotating JSONL
│           └── hook.ts                       # hook entrypoint, --tool dispatches adapter
├── docs/
│   ├── superpowers/specs/                    # this file
│   ├── adapters/                             # captured hook payload shapes per tool
│   └── CONTRIBUTING.md
├── .github/workflows/
│   ├── ci.yml                                # matrix: { os: [macos, windows], node: [20, 22] }
│   └── release.yml                           # changesets → npm publish + GitHub release
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### Data flow

```
agent CLI fires hook
   │
   │  JSON on stdin
   ▼
agent-notifier hook --tool <name>
   │
   ├─ adapters[<name>].classify(payload) → Event | null
   ├─ project.resolve(event.cwd) → projectKey (git-root or cwd)
   ├─ config.load() + idle-gate.check() → idleSeconds
   ├─ suppress.evaluate(config, now, event, idleSeconds) → { fire, reason? }
   ├─ logger.append({ event, fire, reason })
   └─ if fire → notify(event)
        │
        └─ node-notifier with platform-specific sound + style
```

### Single notify chokepoint
All notification dispatch goes through `core/notify.ts`. No adapter, no CLI command, ever calls `node-notifier` directly. This is the seam where sound selection and the actual cross-platform call live. Suppression logic lives one layer up in `core/suppress.ts` so it stays pure and exhaustively unit-testable.

### Cross-platform notification implementation
- **macOS:** `node-notifier` with the `NotificationCenter` reporter, which delegates to the bundled `alerter` binary. Sticky-alert support requires `alerter` (not `terminal-notifier`). Sound names: standard macOS sounds (`Sosumi`, `Tink`, `Glass`).
- **Windows:** `node-notifier` with the `WindowsToaster` reporter, which delegates to bundled `SnoreToast`. Sticky behavior implemented by toast `scenario="alarm"`. Sound names: `ms-winsoundevent:*` URIs.

### Cross-platform idle detection (`idle-gate.ts`)
- **macOS:** `ioreg -c IOHIDSystem` → parse `HIDIdleTime` field, divide by 10⁹ for seconds.
- **Windows:** spawn `powershell -NoProfile -Command "[Math]::Round((New-TimeSpan -Start ([System.Runtime.InteropServices.Marshal]::ReadIntPtr(...))).TotalSeconds)"` — wraps the `GetLastInputInfo` Win32 API.
- Both implementations are timeout-bounded (200 ms) and fail-open: if idle detection errors, treat user as idle (i.e., notify) rather than swallow the event.

### Logging (`logger.ts`)
- Append-only newline-delimited JSON to `<config-dir>/log/notifier.log`.
- Each line: `{ts, tool, kind, project, sessionId, suppressed?, error?}`.
- **Size-based rotation** (hand-rolled, zero deps, ~30 lines):
  - On every write, `fs.statSync` the log file.
  - If size > `AGENT_NOTIFIER_LOG_MAX_BYTES` (default 1 MB):
    - Rename `notifier.log.2` → `notifier.log.3` (delete `.3` if exists)
    - Rename `notifier.log.1` → `notifier.log.2`
    - Rename `notifier.log` → `notifier.log.1`
    - Open fresh `notifier.log`
  - Keep `AGENT_NOTIFIER_LOG_GENERATIONS` (default 3) generations.
- Tunable via env vars; defaults safe for normal use.

### Config & state directory
| OS | Path |
|---|---|
| macOS | `~/.agent-notifier/` |
| Windows | `%APPDATA%\agent-notifier\` |

Subdirs: `log/`, `state/` (reserved for future), `backups/` (copies of edited dotfiles). Top-level files: `config.json` (zod-validated, atomic writes).

## CLI Commands

```
# Onboarding & wiring
agent-notifier init                                      # interactive setup (tools, tz, schedule, defaults, test pings)
agent-notifier install                                   # headless: wire hooks for detected tools, idempotent
agent-notifier uninstall                                 # restore .bak files, remove plugin files

# Diagnostics
agent-notifier doctor                                    # check wiring, fire test notifications, print config dir
agent-notifier status                                    # current state: global, mute, schedules, tools, current project, last 5 logs

# Toggles
agent-notifier enable  [--global | --project [PATH] | --tool TOOL]    # default: --project .
agent-notifier disable [--global | --project [PATH] | --tool TOOL]    # default: --project .

# Mute (global, time-bounded)
agent-notifier mute <duration>                           # 30m, 2h, 1d, "until 5pm", "until tomorrow", ISO timestamp
agent-notifier unmute

# Schedules (global allow/deny weekly windows)
agent-notifier schedule list
agent-notifier schedule add --allow|--deny --days mon-fri --from 09:00 --to 18:00 [--id NAME]
agent-notifier schedule remove <id>
agent-notifier schedule clear

# Logs
agent-notifier logs [--project [PATH]] [--tool T]... [--kind K]... [--suppressed | --fired]
                    [--since DURATION] [--tail N] [--follow] [--json]

# Internal (invoked by hooks themselves; not for direct user use)
agent-notifier hook --tool {claude-code|codex|gemini|opencode}

agent-notifier --version
agent-notifier --help
```

**`init` flow:** interactive — see Management Layer § Onboarding above.

**`install` flow:**
1. Probe for each tool (file paths: `~/.claude/settings.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`, OpenCode plugin dir).
2. For each found tool: parse existing config, check if `agent-notifier` already wired (idempotency). If not: backup, merge, write atomically (write to `<file>.tmp`, fsync, rename).
3. Print summary: `✓ Claude Code (added 2 hooks)  ✓ Gemini CLI (already installed)  ✗ Codex (not detected)`.
4. Suggest `agent-notifier doctor` next, then `agent-notifier init` if no config.json exists.

**`doctor` flow:**
1. Print platform, Node version, agent-notifier version, config dir.
2. For each adapter: check tool installed, hooks wired, last 5 log lines for that tool.
3. Fire one test notification per kind (`PERMISSION`, `IDLE`, `TURN_DONE`) — user sees them and confirms reception.
4. Exit code 0 if everything healthy, non-zero with diagnostic if not.

**`status` output (mock):**
```
agent-notifier 1.0.3 · macOS 15.4 · ~/.agent-notifier

Global:        enabled
Muted:         no
Schedules:     [work-hours] allow Mon-Fri 09:00-18:00 IST  (active now)
Tools:         claude-code ✓   codex ✓   gemini ✓   opencode ✗ (not installed)
Current dir:   /Users/john/Desktop/Education/grind/notifier
Project:       enabled · all kinds
Idle gate:     ON (threshold 30s; you've been active 12s ago)

Recent (last 5):
  10:42:03  PERMISSION   notifier        claude-code   fired
  10:38:11  TURN_DONE    notifier        claude-code   fired
  10:30:55  IDLE         elakio          codex         suppressed (schedule-deny)
  10:28:00  PERMISSION   elakio          codex         fired
  10:21:14  TURN_DONE    notifier        claude-code   fired
```

## Testing Strategy

### Unit (Vitest, both packages)
- **Adapters:** fixture-driven. `tests/fixtures/<tool>/<event>.json` holds real captured hook payloads. Each fixture asserts the resulting `Event` (or `null`).
- **Classifier:** every kind, every tool, edge cases (missing fields, malformed JSON, unknown event types).
- **Notify:** mock `node-notifier`, assert call args (title, body, sound, scenario) per kind per OS (toggle `process.platform` via vitest mock).
- **Suppress (decision tree):** truth table over every combination of `(global, mute, schedule, tool, project, kind, idle)`. Pure function, target 100% branch coverage. This module is the brain; it must be bulletproof.
- **Schedule:** evaluator unit-tested across day boundaries, midnight-crossing windows, multiple timezones (DST shoulder days included), allow-vs-deny precedence, empty rule sets.
- **Config:** zod validation rejects malformed JSON; atomic write survives simulated mid-write crash (write to tmp, kill before rename → original intact); migration on version bump preserves user data + creates `.bak`.
- **Project:** git-root resolution walks correctly; falls back to cwd when no `.git`; cache invalidation across hook invocations.
- **Idle-gate:** parse fixture outputs of `ioreg` and PowerShell; test fail-open path; timeout-bounded.
- **Logger:** rotation triggers at boundary, generations capped, concurrent-write safe (advisory file lock or append-only writes).
- **Install/uninstall:** dry-run mode, no real fs writes; assert planned mutations against snapshots; idempotency (running twice = no-op); uninstall restores original files byte-for-byte from `.bak`.
- **CLI commands:** each command's argument parsing + happy-path + error-path tested in isolation. `init` mocked via `@inquirer/prompts` test harness. `logs` filtering tested against fixture log files. `mute`/`schedule add` natural-language parsers tested exhaustively (`"2h"`, `"until 5pm"`, `"tomorrow"`, garbage input rejected with helpful message).

**Coverage bar:** 90% lines, 85% branches overall. **100% branch on `suppress.ts` and `schedule.ts`** — these are the brain and have a manageable input space.

### Integration
- Spawn the bundled CLI binary as a subprocess for each test.
- **Hook path:** pipe synthetic hook JSON into stdin via `agent-notifier hook --tool claude-code`. Mock `node-notifier` via dependency-injection seam (`--notify-impl=stub` writes JSON to a fixture file instead of firing a real notification). Assert the stub fixture matches expected output.
- **Management commands:** run each command (`enable`, `disable`, `mute`, `schedule add`, `logs --tail`, etc.) against a temp `HOME` directory. Assert config.json mutations and stdout/exit-code.
- **End-to-end suppression:** install in temp HOME → `enable --project /tmp/x` → fire a hook for project `/tmp/x` → assert notification stub fired. Then `disable --project /tmp/x` → fire same hook → assert suppressed with reason `"project-disabled"` in log.
- **Onboarding:** `init` driven by scripted `@inquirer/prompts` mock; assert resulting config.json matches expected snapshot.

### Cross-platform CI
GitHub Actions matrix: `{ os: [macos-latest, windows-latest], node: [20, 22] }` = 4 jobs per push. All four green to merge.

### End-to-end smoke (local only, skipped in CI)
- `pnpm test:smoke` runs `agent-notifier doctor` and asserts exit code 0 in a graphical session.
- Documented manual checklist in `docs/CONTRIBUTING.md#release-smoke`:
  - Install on fresh macOS VM and fresh Windows VM (separate runs).
  - Run `init`; verify all prompts work, config.json valid afterwards.
  - Fire all 12 notification combinations (3 kinds × 4 tools); verify clickthrough behavior.
  - `mute 30s` → verify suppression, wait, verify auto-unmute. Run `unmute` mid-mute, verify resumes.
  - `schedule add --deny` covering "now"; fire hook, verify suppressed with right reason in `logs --suppressed`.
  - `disable --project .` in a git repo → fire hook → verify suppressed; `enable --project .` → fire → verify fires.
  - `uninstall` → diff every touched dotfile against pre-install backup → must be byte-identical.

## Distribution

- **npm:** primary distribution. `npm i -g agent-notifier`.
- **Homebrew (mac):** `brew install agent-notifier` formula, post-install runs `agent-notifier install`. Stretch goal for v1.1.
- **Scoop / winget (Windows):** Scoop manifest in `scoop-bucket/`, winget submission. Stretch goal for v1.1.
- **GitHub Releases:** every changeset publish creates a release with auto-generated notes.

## Repository Hygiene

- **License:** MIT (most permissive, lowest adoption friction).
- **README:** badges (CI, npm version, downloads), animated screenshot per OS, 60-second install path, troubleshooting section pointing at `doctor`.
- **CONTRIBUTING.md:** dev setup, test commands, manual smoke checklist, adapter-author guide ("how to add a new tool in <50 lines").
- **CHANGELOG.md:** auto-generated by changesets.
- **CODE_OF_CONDUCT.md:** Contributor Covenant.
- **Issue templates:** bug (auto-asks for `doctor` output), feature, adapter request.
- **No telemetry. No analytics. No network calls.** Hard-coded promise in README.

## Security & Privacy

- **No network egress** at runtime. Ever. Audit dependencies for any phone-home behavior.
- **Hook payloads contain user prompts and tool inputs** — these may be sensitive (API keys in commands, source code, etc.). We log only metadata (event kind, project name, session id) and a truncated 80-char message snippet, never full payloads.
- **`agent-notifier doctor` output is sanitized** — paths shown as `~/.agent-notifier/...`, no env vars, no log contents (only sizes and last-modified times).
- **CSO review (gstack `cso` skill) before every release.** Supply chain matters: this CLI gets installed globally and writes user dotfiles.

## Open Decisions for User Review

1. **Project name.** Spec uses `agent-notifier`. Alternatives: `agentping`, `coding-agent-notifier`. Pick before first commit.
2. **License.** Spec assumes MIT. Confirm or swap for Apache-2.0 if patent-grant matters.
3. **OpenCode in v1 vs v1.1.** Spec includes it in v1. If we want to ship faster, defer it (different integration shape — JS plugin instead of stdin hook).
4. **Linux support.** Spec defers to "stretch goal." `node-notifier` supports Linux already, so cost is small if we add it now. Decide.

## Out-of-Scope Reminders

- Cursor / GitHub Copilot CLI / Aider — explicitly excluded (no hook surface or already solved).
- Tab-level terminal focus — terminal AppleScript limitation, not solvable in v1.
- Long-running task done — overlaps with `TURN_DONE`, decided against.
- Web / mobile / push notifications — local Notification Center only.

## Success Criteria

- `npm i -g agent-notifier && agent-notifier install && agent-notifier init` completes end-to-end on a fresh macOS machine and a fresh Windows machine with at least one supported tool installed, without manual config edits.
- `agent-notifier doctor` fires test notifications visibly on both OSes.
- During a real Claude Code session: stepping away during a `npm test` run, the user receives a banner within 5s of Claude finishing the turn (or asking permission), even with VS Code in the foreground.
- `agent-notifier disable --project .` in a project's git-root suppresses all subsequent notifications for that project; `enable --project .` resumes them. Verified by `logs --project . --suppressed` showing reason `"project-disabled"`.
- `agent-notifier mute 1h` suppresses for an hour, then auto-resumes; `unmute` ends the mute early.
- A `--deny` schedule covering "now" suppresses notifications with reason `"schedule-deny"`; outside the window, notifications resume.
- `agent-notifier status` output matches the configured state and recent logs without ambiguity.
- CI matrix (4 jobs) green on PR.
- Coverage ≥ 90% lines / 85% branches overall; **100% branch on `suppress.ts` and `schedule.ts`**.
- Zero hand-edits to user dotfiles after `uninstall` (verified via diff against pre-install backup).
