# Onboarding UX, Per-Project Config, Re-init, and Idle-Gate Redesign

- **Status:** Draft (awaiting user review)
- **Date:** 2026-05-03
- **Author:** Brainstormed with John Prem Kumar S
- **Affects:** `packages/cli/src/{init,install,uninstall,status,enable,disable,index}.ts`, `packages/core/src/{config,suppress,idle-gate,notify,types}.ts`, new `packages/cli/src/project.ts`, new `packages/cli/src/reset.ts`
- **Schema:** Bumps `Config.version` from `1` to `2` (auto-migration; one-time `.v1.bak`)
- **Non-goals:** Bundling a custom audio asset *with the package* (users supply their own paths); implementing per-tab focus for kitty / Alacritty / Hyper (no portable API); revamping the `hook` command's payload contract; renaming any existing command

## 1 Goals

1. **Onboarding for laymen with good defaults.** First-run flow ≤ 30 seconds, ≤ 2 prompts, defaults are correct for ~90% of users.
2. **Easy per-project configuration.** A dedicated `project` subcommand exposes per-project enabled-state and per-kind filters (which the schema already supports but the CLI never surfaced).
3. **Safe, idempotent re-init.** Running `init` again is a non-destructive reconfigure — every prompt preselects the current value; hit-enter-through is a no-op.
4. **Fix the "user-active" suppression bug.** Notifications are no longer suppressed because the user is typing in another app. Per-tab granularity where the OS / terminal cooperates.
5. **One subtle sound across kinds, custom-overridable.** Ping (mac) / `Notification.Default` (win) for all three event kinds; per-kind persistence (sticky on PERMISSION) is preserved. Users can override with a built-in sound name or an absolute path to their own `.aiff` / `.caf` (mac) / `.wav` (win) file.
6. **Friendly bundled app icon.** Notifications display a designed agent-notifier mark — not the parent terminal's icon, not a generic Node icon. Bundled PNG/ICNS for mac, ICO for win. User-overridable via config (absolute path to their own image).
6. **Best-in-class CLI UI.** Calm-by-default visual language, no emoji, `ora` spinners only for genuinely-slow ops, width-aware output, TTY/JSON/quiet/debug modes across every command.

## 2 Non-goals

- Bundling our own audio file with the package. Users provide their own paths if they want a custom sound — keeps the package small and avoids licensing complexity.
- Per-tab focus detection for terminal emulators with no introspection API (Ghostty, Alacritty, Hyper, kitty without remote-control). Policy-(b) fallback fires when we can't determine the focused tab.
- Cross-machine config sync, GUI preferences pane, telemetry, or auto-update.
- Renaming or removing any existing command. All existing commands keep their current contract.

## 3 Audience

Primary: **engineer using AI coding CLIs** who has not edited `~/.claude/settings.json` and doesn't want to learn the schema. Wants "press enter, it works."

Secondary: **curious non-developer** who installed Claude Code from a tutorial. Will be confused by terms like "hook" or "TURN_DONE." Needs plain English in prompts.

Tertiary: **power user** with custom schedules, multiple machines, per-project rules. Wants flag-driven non-interactive paths and machine-readable output.

The default flow targets primary + secondary; tertiary self-selects into `--advanced`, `--non-interactive` flags, the `project` subcommand, and `--json` outputs.

## 4 Command surface

```
agent-notifier                     bare → status (when configured) | init wizard (when not)
agent-notifier init                smart wizard; auto-detects first-run vs re-init
agent-notifier init --advanced     adds prompts for schedule, idle-gate, sound, kinds
agent-notifier init --tools=...    non-interactive (CI / dotfiles)
agent-notifier project             interactive editor for current project's rules
agent-notifier project show        print rules for cwd (or --project=<path>)
agent-notifier project set [...]   flag-driven: --enabled, --kinds, --project
agent-notifier project clear       remove project entry; falls back to projectDefault
agent-notifier project list        list all configured projects
agent-notifier reset               wipe config + uninstall hooks (confirmed; preserves logs)
```

Existing commands unchanged: `install`, `uninstall`, `doctor`, `status`, `enable`, `disable`, `mute`, `unmute`, `schedule {list,add,remove,clear}`, `logs`, `hook`.

**Universal flags** — every command accepts `--quiet`/`-q`, `--json`, `--no-color`, `--debug`. See Section 10.4. Per-command flags listed in their respective sections.

### Bare-command behavior

`agent-notifier` with no arguments:
- If `~/.agent-notifier/config.json` is missing → run `init` wizard.
- Otherwise → run `status` (compact form).
- `--help`, `-h`, `--version`, `-V` continue to work explicitly.

## 5 Wizard flow

### 5.1 Layman path (≤ 2 prompts)

```
agent-notifier — set up

  Detected on this machine
    ✓ claude-code   ~/.claude/settings.json
    ✓ codex         ~/.codex/config.toml
    ✓ opencode     ~/.config/opencode/...
    ·  gemini        not installed

  › Wire these up? (Yes)
    We'll back up each config to <file>.agent-notifier.bak before editing.

  › Send a test notification now? (Yes)
    Heads up: macOS may ask permission for agent-notifier to detect which app you're
    focused on — say allow. That's what makes notifications fire only when you're
    not looking at the agent's terminal.
    🔊 — "Agent is done · agent-notifier · test"

  ✓ Done. You'll get a ping when:
      · an agent asks for permission
      · an agent finishes a turn
      · an agent goes idle for 60s while waiting on you
    …unless you're focused on the same terminal tab the agent is running in.

  Pro tip: `agent-notifier init --advanced` for schedules, sound, gate options.
           `agent-notifier project` (in any project dir) for per-project rules.
```

### 5.2 Defaults (when user hits enter)

| Setting | Default | Rationale |
|---|---|---|
| Tools | All detected, wired | "Installed → wanted" |
| `global.enabled` | `true` | Notifier off = useless install |
| `projectDefault.enabled` | `true` | New projects notify; opt-out per-project later |
| `schedules` | `[]` | Most users don't want time windows; advanced opt-in |
| `idleGate.mode` | `'fire-elsewhere'` | Bug fix; matches user intent |
| `idleGate.thresholdSeconds` | `60` | Aligns code with `CLAUDE.md` (was 30s) |
| `idleGate.unsupportedTerminalPolicy` | `'fire'` | Policy (b) — fire when terminal doesn't expose tab focus |
| `tools.<each>.enabled` | `true` | Tool-level on by default |
| Kinds enabled (per project) | all three | Conservative defaults already; gate fix removes prior over-suppression |
| `sound.darwin` | `'Ping'` | Subtle bell tone; pleasant in repetition; chime-like character without alarm-coding |
| `sound.win32` | `'ms-winsoundevent:Notification.Default'` | Standard Windows toast tone |
| `icon.darwin` | `null` (→ bundled `assets/icon.png` / `.icns`) | Branded notification mark, not the parent terminal's icon |
| `icon.win32` | `null` (→ bundled `assets/icon.ico`) | Same brand on Windows toast |
| `mute` | `null` | — |
| `logging.maxBytes` | `1_000_000` | Existing cap; now configurable |
| `logging.generations` | `3` | Existing cap; now configurable |

### 5.3 Advanced flow (`init --advanced`)

After the basic prompts, before "send a test":

```
  › Advanced settings? (No)
    Yes → schedule              (none / work-hours 09:00–18:00 mon-fri / custom)
        → idle-gate mode        (fire-elsewhere / always-fire / strict-terminal / strict-os-idle)
        → idle threshold        (60s default — meaningful when frontmost is AI's terminal)
        → on unsupported tabs   (fire / gate — what to do when the terminal can't tell us
                                 which tab is focused; default = fire, matches policy (b))
        → sound                 (Ping / Glass / Hero / Pop / Tink / custom path — preview each)
        → custom icon           (No / yes — enter absolute path to your own image)
        → kinds                 (PERMISSION / IDLE / TURN_DONE — toggle each)
        → projectDefault        (new projects notify by default? yes/no)
```

Each prompt preselects current values on re-init.

### 5.4 Non-interactive flags

Any flag passed implies non-interactive mode. Mix-and-match supported: passed flags are locked, unpassed fields prompt.

```
agent-notifier init --tools=claude-code,codex --no-test
agent-notifier init --schedule=09:00-18:00 --schedule-days=mon-fri
agent-notifier init --idle-gate=fire-elsewhere --idle-threshold=60
agent-notifier init --unsupported-tab-policy=gate    # opt out of fire-by-default for Ghostty et al
agent-notifier init --sound=Ping --kinds=PERMISSION,TURN_DONE
agent-notifier init --sound=/Users/me/sounds/my-chime.aiff   # custom audio path
agent-notifier init --icon=/Users/me/icons/agent.png         # custom notification icon
agent-notifier init --icon=default                           # reset to bundled icon
agent-notifier init --reset  # wipe + re-run with defaults (confirms unless --yes)
```

If every relevant field is supplied via flags, no prompts run.

## 6 Re-init mechanics

### 6.1 Single command, two contexts

`init` checks for `~/.agent-notifier/config.json`. Same prompts, only the headline changes:
- Missing → "agent-notifier — set up" + first-run defaults
- Present → "agent-notifier — reconfigure" + values preselected from current config

No separate `reconfigure` command. No "what do you want to change?" branch menu. The wizard is the same; the defaults are different.

### 6.2 Tool checkbox semantics on re-init

| State today | Default in checkbox | Toggle on action | Toggle off action |
|---|---|---|---|
| Detected + wired | `[x]` | (no-op) | `inst.uninstall()` (restores `.bak`) |
| Detected + not wired | `[ ]` | `inst.install()` (with backup) | (no-op) |
| Not detected | `[ ]` disabled | unselectable | unselectable |

Toggling a wired tool off **uninstalls cleanly**. The user never has to learn the separate `uninstall` command for partial removal.

### 6.3 Lock file

`~/.agent-notifier/.init.lock` written at start of `init`, deleted at end. Contains the running PID. If a second `init` finds the lock and the PID is alive, it aborts with a clear message. Stale lock (PID dead) is silently reclaimed.

### 6.4 Reset

`agent-notifier reset` is a separate command (not a flag on `init`):

```
$ agent-notifier reset

  This will:
    · uninstall hooks from claude-code, codex, opencode
      (restores ~/.claude/settings.json.agent-notifier.bak etc.)
    · delete ~/.agent-notifier/config.json
    · keep ~/.agent-notifier/log/ (your history)

  › Type 'reset' to confirm:
```

Backup files are NOT deleted (they remain available for manual recovery). Logs remain. `--yes` flag for non-interactive use.

## 7 `project` subcommand

Lives outside `init` because project rules are CWD-scoped, not machine-scoped.

### 7.1 Interactive editor (`agent-notifier project`)

```
agent-notifier — project rules

  Project   notifier
  Path      ~/Desktop/Education/grind/notifier
  Status    not configured (default rules apply: all kinds, notify on)

  › Notify for this project? (Yes)
  › Which events?
    [x] PERMISSION    agent asks for approval
    [x] TURN_DONE     agent finishes a turn
    [x] IDLE          agent waiting on you for 60s+

  ✓ Saved. Run `agent-notifier project show` to confirm.
```

On re-run with config already set, all answers preselect from current rules. Hit-enter-through = no diff.

### 7.2 Sub-commands

```
agent-notifier project show [--project=<path>] [--json]
agent-notifier project set [--enabled=<bool>] [--kinds=<list>|all] [--project=<path>]
agent-notifier project clear [--project=<path>] [--yes]
agent-notifier project list [--json]
```

Storage: central, in `~/.agent-notifier/config.json`. Project key resolution uses existing `resolveProjectKey(cwd)` from `packages/core/src/project.ts`. Rules apply to the keyed directory and all subdirectories.

**Tradeoff considered:** per-project `.agent-notifier/` dir (like `.git`). Rejected — would clutter every repo, conflicts with version control intent, no clear benefit for a tool that's already global-config-shaped.

## 8 Idle-gate redesign

### 8.1 Decision tree

```
Hook fires → classify → produce Event
  if kind == PERMISSION → FIRE (always; agent is blocked)
  else:
    PID0          = process.ppid                                           (immediate parent of hook)
    AI PID        = walk up while comm matches a known shell               (skip bash | sh | zsh | fish | dash)
                    until comm matches an AI tool exe (claude | codex | gemini | opencode)
                    OR until parent's comm matches a known terminal        (then PID0 is the AI tool)
    AI's TTY      = ps -o tty= -p <AI PID>                                 (e.g. ttys003)
    AI's terminal = continue walking PPID chain until comm matches a terminal exe
    Frontmost     = osascript "frontmost app bundle id"
    if Frontmost ≠ AI's terminal app → FIRE                                (different app entirely)
    if Frontmost == AI's terminal app:
      Active tab TTY = terminal-specific lookup (dispatch table)
      if active tab TTY == AI's TTY                  → SUPPRESS            (user is on AI's tab)
      if active tab TTY ≠ AI's TTY                   → FIRE                (sibling tab)
      if terminal doesn't expose this (Ghostty et al) → FIRE              (policy (b))
```

**Shell-hop rationale:** Claude Code allows `command: bash -c "agent-notifier hook ..."` style hooks. In that case `process.ppid` is `bash`, not `claude`. The walk skips intermediate POSIX shells until it finds the AI tool. Bounded depth: max 8 levels of PPID walk (defense against pathological process trees / fork bombs); fail-open if exceeded.

Failure modes — all → FIRE (fail-open):
- AppleScript / PowerShell timeout (200ms)
- AI process gone before lookup completes
- `ps` returns nothing (orphaned shell, race)
- Any unhandled exception in detection code

### 8.2 Per-terminal active-tab lookup table

| Terminal | Bundle ID / Process | Lookup |
|---|---|---|
| Terminal.app | `com.apple.Terminal` | `tell app "Terminal" to get tty of selected tab of front window` |
| iTerm2 | `com.googlecode.iterm2` | `tell app "iTerm2" to tty of current session of current window` |
| VSCode / Cursor / Windsurf — **Windows only** | `Code.exe`, `Cursor.exe`, `Windsurf.exe` | `GetForegroundWindow` + `GetWindowThreadProcessId` — Win32 cleanly identifies the focused editor window's PID, walk children to find active integrated terminal |
| VSCode / Cursor / Windsurf — **macOS** | `com.microsoft.VSCode`, `com.todesktop.230313mzl4w4u92`, `com.exafunction.windsurf` | **Not supported on mac** — `ps E` env access is truncated/per-pid and there's no portable way to identify which VSCode window owns a given child shell. Falls through to `unsupportedTerminalPolicy` (default `'fire'`) |
| Windows Terminal (1.16+) | `WindowsTerminal.exe` | JSON-RPC over named pipe `\\.\pipe\Terminal-<runtime-id>` for active pane (pipe name discovered via `Get-Process` matching) |
| Ghostty | `com.mitchellh.ghostty` | Not supported → policy (b) |
| Alacritty | `org.alacritty` | Not supported → policy (b) |
| kitty | `net.kovidgoyal.kitty` | Optional: `kitty @ ls` if remote-control on; else policy (b) |
| WezTerm | `com.github.wez.wezterm` | Optional: `wezterm cli get-pane-info` if daemon present; else policy (b) |
| Hyper | `co.zeit.hyper` | Not supported → policy (b) |

### 8.3 tmux / screen / multiplexers

Detect `tmux` or `screen` in process tree → fall back to "treat as if terminal app is unsupported" → policy (b) → fire. Documented; revisit if user feedback warrants per-pane detection.

### 8.4 Cache

2-second module-scope cache for both `getFrontmostBundle()` and the active-tab-TTY lookup. Avoids extra `osascript` spawns when notifications come in bursts (e.g., PERMISSION quickly followed by TURN_DONE). Cache is per-hook-invocation (each hook is a fresh process).

### 8.5 Modes and policies (orthogonal)

`idleGate.mode` chooses the overall strategy:

| `idleGate.mode` | Behavior |
|---|---|
| `fire-elsewhere` *(default)* | Decision tree above; per-tab when supported, falls through to `unsupportedTerminalPolicy` otherwise |
| `always-fire` | Skip the gate entirely; fire every event |
| `strict-terminal` | Conservative: gate the whole terminal app as one unit when frontmost (no per-tab lookup attempted) |
| `strict-os-idle` | Legacy: HIDIdleTime / GetLastInputInfo only; no frontmost or per-tab logic. Escape hatch for unusual desktops |

`idleGate.unsupportedTerminalPolicy` chooses what to do when `mode = fire-elsewhere` AND the terminal doesn't expose active-tab focus:

| Value | Behavior |
|---|---|
| `'fire'` *(default — policy (b))* | Fire the notification; user gets pinged even on Ghostty / Alacritty / Hyper sibling-tab cases |
| `'gate'` *(policy (a))* | Treat the whole terminal app as in-focus and apply the threshold; never pings if user is anywhere in that terminal app |

The two settings are independent. `mode = always-fire` ignores the policy. `mode = strict-terminal` ignores the policy (always gates as one unit). `mode = strict-os-idle` ignores everything terminal-related.

PERMISSION events bypass the gate in all modes — non-negotiable.

The policy is exposed in three places: (1) `init --advanced` interactive prompt, (2) `init --unsupported-tab-policy=fire|gate` flag for non-interactive setup, (3) directly editable in `~/.agent-notifier/config.json` under `idleGate.unsupportedTerminalPolicy`.

### 8.6 Performance

Cold path: ~70ms p99 (process tree walk + frontmost AppleScript + active-tab lookup). Stays well under the 500ms hook hot-path budget. Warm (within cache window): ~1ms.

## 9 Notification branding (icon + sound)

### 9.1 Bundled app icon

Today, mac notifications show whichever icon the spawning process advertises (often the parent terminal app's icon — Ghostty, iTerm, etc.) or `terminal-notifier`'s generic icon. On Windows, the toast shows the calling exe's icon. Both look unbranded.

We bundle a designed agent-notifier mark and pass it explicitly to `node-notifier` on every fire.

**Asset shape:**

| Platform | File | Size | Format | Source |
|---|---|---|---|---|
| macOS | `assets/icon.png` | 512×512 (with 256 fallback for older systems) | PNG with alpha (system rounds the corners) | Bundled in `packages/core/assets/` |
| macOS (sticky / `terminal-notifier`) | `assets/icon.icns` | multi-res | ICNS | Bundled in `packages/core/assets/` — required by `terminal-notifier`'s `--appIcon` |
| Windows | `assets/icon.ico` | 256×256 (multi-res ICO) | ICO | Bundled in `packages/core/assets/` |

**Why `core` not `cli`:** `packages/core/src/notify.ts` is the chokepoint that fires every notification and resolves the bundled path. Putting assets in `cli` would force `core → cli` import (wrong direction; cli depends on core). Assets live with the code that consumes them. The cli package never references icon files directly — it only writes user-override paths into config, which core reads.

**Design brief — friendly mark:**

- A stylized bell or chat-bubble with a soft notification dot, or a small abstract "agent face" (two dots / eyes peeking) — friendly, approachable, NOT alarm-coded
- Rounded geometry, no sharp corners (notification thumbnails are auto-rounded on macOS Sonoma+)
- Two colors max + the alpha channel; readable at 32×32 (small badge size in macOS Notification Center)
- No text in the mark — `agent-notifier` text comes from the notification title
- Light-mode and dark-mode variants if budget allows; if not, a single mark that reads against either background (mid-tone fill, no pure white or pure black)
- Mark created either (a) by a designer, (b) via image-generation tool with a tight brief, or (c) hand-built in SVG → exported. Final SVG checked into `assets/source/` so future re-renders are reproducible

The icon asset is part of the implementation PR. The spec does not lock in the exact glyph — that's a design decision during implementation, with at least three options reviewed before commit.

### 9.2 Path resolution at runtime

`packages/core/src/notify.ts` resolves the bundled icon path relative to its own dist location:

```ts
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLED_ICON = {
  darwin: resolve(here, '../assets/icon.png'),
  darwinIcns: resolve(here, '../assets/icon.icns'),
  win32: resolve(here, '../assets/icon.ico'),
};
```

**Build + publish wiring (locked, not optional):**

1. `packages/core/package.json` `files` array adds `"assets"` so the directory ships in the published tarball alongside `dist`.
2. `packages/core/tsup.config.ts` adds an `onSuccess` hook that runs `cp -r assets dist/../assets` (idempotent — `assets/` sits at the package root, sibling to `dist/`, NOT inside `dist/`). The path resolution above (`resolve(here, '../assets/...')`) walks one level up from `dist/` to find them.
3. Smoke test step asserts the published tarball (`npm pack --dry-run`) lists `package/assets/icon.png`, `icon.icns`, and `icon.ico`. CI fails if any are missing.
4. Source SVG checked into `packages/core/assets/source/icon.svg`. Build target sizes (PNG 256/512, ICNS multi-res, ICO 16/32/48/256) generated via a one-shot `pnpm gen:icons` script (uses `sharp` + `png2icons` as dev dependencies, NOT runtime). The script is documented but not part of the build hot path — re-run only when the SVG changes.

**Tradeoff considered:** using `tsup`'s `loader: { '.png': 'copy' }` for image extensions. Rejected — only works if the assets are imported from TS code (they're not; they're path-resolved at runtime). Explicit `cp` in `onSuccess` is simpler and matches what the runtime code expects.

### 9.3 User override (custom icon)

`config.icon.{darwin,win32}` accepts an absolute path to a user-provided image. Validation rules:

- Path exists at config save time → accept
- File extension matches platform expectation (`.png`/`.icns` for darwin, `.ico` for win32) → accept
- File missing or wrong type → fail config save with `✗ Couldn't set custom icon / Why: <path> not found / Next: provide an absolute path to a PNG (mac) or ICO (win)`
- At fire time, if a custom path was set but the file has since gone missing → fall back to bundled default icon, log `icon-fallback` once per session

### 9.4 Surfaced in `init --advanced`

```
  › Custom notification icon? (No — use bundled default)
    Yes → enter absolute path to your own image
          (PNG/ICNS for mac · ICO for win · must exist at this path)
```

CLI flag: `init --icon=/path/to/icon.png`. CLI flag `init --icon=default` resets to bundled.

### 9.5 Single-sound notification

`packages/core/src/notify.ts` simplifies. Per-kind `title` and `sticky` are preserved (PERMISSION is still sticky+looping because the agent is blocked); `sound` is the same across all three kinds.

```ts
const KINDS: Record<Kind, { title: string; sticky: boolean }> = {
  PERMISSION: { title: 'Claude needs approval', sticky: true  },
  IDLE:       { title: 'Agent is idle',         sticky: false },
  TURN_DONE:  { title: 'Agent is done',         sticky: false },
};

// Resolved per fire — sound and icon may be built-in or absolute path:
function resolveAssets(config: Config) {
  return {
    sound: config.sound[platform] ?? DEFAULT_SOUND[platform],   // 'Ping' | absolute path
    icon:  config.icon[platform]  ?? BUNDLED_ICON[platform],    // bundled path | user path
  };
}
```

PERMISSION on Windows: `scenario: 'alarm'` for the looping/blocking effect; sound stays `Notification.Default`. The persistence and the sound are independent properties on Windows toast.

Path-vs-name distinction at the `node-notifier` boundary:
- macOS: if `sound` is a built-in name (matches `^[A-Z][a-z]+$` and exists in `/System/Library/Sounds/`), pass as `sound: 'Ping'`. If absolute path (`startsWith('/')`), pass as `sound: '/Users/me/sounds/my.aiff'` — node-notifier supports both natively.
- Windows: built-in tokens use `ms-winsoundevent:` prefix. Absolute path → pass to SnoreToast's `--sound` option (requires `.wav`).

## 10 Visual & interaction language

### 10.1 Principles

- Calm by default; bold and color reserved for status and active prompts
- No emoji — Unicode symbols only (`✓ ✗ ! · › ⚠ ▸ —`)
- Alignment over decoration (no boxes, no banners, no ASCII art)
- Color-blind safe — symbols carry meaning, color reinforces
- Width-aware — truncate long paths with `…` in the middle, wrap prose, never overflow
- TTY-aware — `process.stdout.isTTY === false` → no colors, no spinners; `--quiet` further suppresses; `--json` for machine output

### 10.2 Symbol set

| Symbol | Meaning | Color |
|---|---|---|
| `✓` | success / wired / enabled | green |
| `✗` | not detected / removed | gray |
| `!` | detected, action available | yellow |
| `·` | inactive / placeholder | gray |
| `›` | active prompt cursor | cyan |
| `▸` | progress step in flight | cyan |
| `⚠` | warning, non-fatal | yellow |
| `—` | neutral state change | dim |

### 10.3 Spinners (`ora`)

Add `ora` (~30 KB; same family inquirer is built on). Used **only** for genuinely-slow operations:
- Detecting installed tools
- Wiring each tool
- Sending test notifications

Not used for instantaneous ops. A flash-and-disappear spinner feels janky.

### 10.4 Output mode flags (unify across all commands)

- `--quiet` / `-q` — suppress non-error output
- `--json` — machine-readable; exits 0 even on no-op
- `--no-color` — `NO_COLOR=1` env already respected via kleur; flag for parity
- `--debug` (or `AGENT_NOTIFIER_DEBUG=1`) — full stack traces, command logging, gate-decision diagnostics

### 10.5 Errors

Three lines: **what / why / next**.

```
✗ Couldn't wire claude-code

  Why:  ~/.claude/settings.json contains invalid JSON
        (parse error at line 14, column 3)
  Next: Open the file, fix the JSON, then re-run `agent-notifier init`.
        Or run `agent-notifier reset` to start fresh (we'll back it up first).
```

No bare stack traces unless `--debug`.

### 10.6 `status` revamped

```
agent-notifier 0.1.0 · darwin · ~/.agent-notifier

  Notifications  ✓ on              (mute: —, schedule: —)
  Tools          ✓ claude-code   ✓ codex   · gemini   ✓ opencode
  This project   ~/Desktop/Education/grind/notifier
                 default rules apply (notify on all kinds)
  Idle gate      fire-elsewhere (60s threshold; policy = fire on unsupported terminals)

  Recent (3)
    19:42  TURN_DONE   notifier        claude-code   ✓ fired
    19:38  PERMISSION  notifier        claude-code   ✓ fired
    19:31  IDLE        other-project   codex         · suppressed (project-disabled)
```

`status --verbose` adds the full schedule list, all configured projects, idle-gate diagnostics (frontmost-app, active-tab TTY, AI's TTY), log path, and node-notifier version. `status --json` emits the full `Config` plus computed fields.

## 11 Schema migration

### 11.1 v2 schema

`Config.version` bumps from `1` to `2`. New fields, all with zod defaults:

```ts
idleGate: {
  mode: 'fire-elsewhere' | 'always-fire' | 'strict-terminal' | 'strict-os-idle' = 'fire-elsewhere',
  thresholdSeconds: number = 60,
  unsupportedTerminalPolicy: 'fire' | 'gate' = 'fire',
}
// sound: built-in name OR absolute path to .aiff/.caf (mac) / .wav (win)
sound: {
  darwin: string = 'Ping',
  win32:  string = 'ms-winsoundevent:Notification.Default',
}
// icon: null = use bundled default; otherwise absolute path to user's image
icon: {
  darwin: string | null = null,   // null → bundled icon.png/icon.icns
  win32:  string | null = null,   // null → bundled icon.ico
}
logging: {
  maxBytes: number = 1_000_000,
  generations: number = 3,
}
```

Validation (zod refinements):
- `sound.darwin` — either matches a built-in name (`^[A-Z][a-z]+$` and exists in `/System/Library/Sounds/`) OR is an absolute path with `.aiff` / `.caf` extension that exists at config save time
- `sound.win32` — either starts with `ms-winsoundevent:` OR is an absolute path with `.wav` extension that exists
- `icon.darwin` — null OR absolute path with `.png` / `.icns` extension that exists
- `icon.win32` — null OR absolute path with `.ico` extension that exists

Failed validation = config save fails with the **what / why / next** error format. At fire time (where the file may have moved/been deleted since save), the resolver falls back to the platform default and logs `asset-fallback` once per session — never crashes the hook.

### 11.2 Migration

`packages/core/src/config.ts` adds a `migrate()` step before `ConfigSchema.parse`:

```ts
function migrate(raw: unknown): unknown {
  if (isObject(raw) && raw['version'] === 1) {
    return { ...raw, version: 2 };  // zod fills new defaults
  }
  return raw;
}
```

`loadConfig()` calls `migrate()` first. v1 configs auto-upgrade on next read; the next save persists the upgraded shape. **No prompt, no user action.**

One-time backup: when migration fires, copy the existing v1 file to `<file>.v1.bak` before save. Recoverable.

Forward compat: v2 config opened by older binary → zod throws on `version: 2` → user sees clear "newer version" error pointing to `init` or `reset`.

## 12 Error handling

| Failure | Where | User-facing response |
|---|---|---|
| Invalid JSON in config file | `loadConfig` | `✗ Couldn't read config / Why: invalid JSON at line N / Next: agent-notifier reset (we'll back it up)` |
| Schema validation fails | `ConfigSchema.parse` | `✗ Config has invalid fields / Why: <zod issue path> / Next: edit the file or reset` |
| Tool dotfile invalid syntax during install | `<tool>Installer.install()` | `✗ Couldn't wire <tool> / Why: <file> contains invalid <format> / Next: fix or skip with --tools=<others>` |
| Lock file held by live PID | `init` start | `⚠ Another setup is in progress (PID N) / Next: wait or remove ~/.agent-notifier/.init.lock if stale` |
| AppleScript / PowerShell timeout | gate detection | Silent fail-open → fire. Logged with `gateDecision: 'fail-open'` only on `--debug`. |
| `osascript` not present | `getFrontmostKind` | Silent fail-open + `gate-detection-unavailable` logged once per session |
| Permission denied on `ps` | process tree walk | Fall back to frontmost-app only; logged once |
| node-notifier crash / no daemon | `notify.ts` | Catch, log, exit 0 (don't crash AI tool's hook chain) |
| Hook payload doesn't validate | `classify.ts` | Return `null`, log `unmapped-event`, exit 0 |

**Hook hot path discipline:** the hook process must NEVER throw uncaught or exit non-zero. Top-level `try/catch` in `runHook()` swallows everything, logs to disk, exits 0. Breaking the user's actual AI session because our gate detection had a hiccup is unacceptable.

## 13 Logging discipline

### 13.1 Production log

`~/.agent-notifier/log/notifications.jsonl` — already capped at 1 MB × 3 generations = 3 MB max. Cap is now configurable via `config.logging.{maxBytes,generations}`.

**Centralization (locked):** `Logger` is currently instantiated with hard-coded options in three places (`status.ts`, `doctor.ts`, `hook.ts`). After this spec, all three need to read from config — easy to miss one and drift. Add a `loggerFromConfig(config)` factory in `packages/core/src/logger.ts` that returns a configured `Logger`. All callsites switch to it. No callsite constructs `new Logger({...})` directly outside the factory.

New fields per entry:

```ts
{
  ts, kind, tool, project, fired, suppressReason,
  // NEW:
  gateMode: 'fire-elsewhere' | 'always-fire' | 'strict-terminal' | 'strict-os-idle',
  gateDecision: 'permission-bypass' | 'frontmost-other-app' | 'frontmost-different-tab'
              | 'frontmost-same-tab' | 'unsupported-terminal-fired' | 'fail-open',
}
```

### 13.2 Stub log (test/init paths)

`~/.agent-notifier/stub-notifications.jsonl` is currently an unbounded `appendFileSync` duplicated in three places (`init.ts:32`, `doctor.ts:42`, `hook.ts`). Two bugs: unbounded growth + triplicated implementation.

Fix:
- Extract `stubNotifyAppend(event)` in `packages/core/src/notify.ts` (single implementation).
- Route through `Logger` with a 256 KB × 1 cap (no history needed for stub — overwrite when full).
- All three callers import the helper; no local `appendFileSync` for stub paths.

### 13.3 Backup files

Two backup file conventions, distinct purposes — both kept:

- **`<file>.agent-notifier.bak`** — written ONCE, the first time `install` edits a tool's dotfile. Represents the user's pre-agent-notifier state. **Never overwritten** on subsequent installs. `uninstall` restores from this file. If it already exists when `install` runs, leave it alone (idempotency).
- **`<file>.<ISO-timestamp>.bak`** — written every time `init` saves a config change after the first one. Represents intermediate states the user might want to roll back to (e.g., they re-ran `init` and want yesterday's settings). Kept indefinitely (could prune old timestamped backups in a future flag — out of scope).

These are separate files for separate purposes; one is install-state, the other is config-history. The audit step: confirm `install.ts`'s backup logic in each per-tool installer respects the "write once, leave alone" rule for `.agent-notifier.bak`. The config-save backup is new code in `config.ts`.

### 13.4 `logs --prune`

New flag. Truncates all rotated logs (including the stub log) to 0. Manual escape hatch if a bug ever caused unbounded growth or the user wants a fresh baseline.

## 14 Testing strategy

### 14.1 Unit (`packages/core/tests/`)

- `idle-gate.test.ts` — parametric over (mode, frontmost, ai-terminal, ai-tty, active-tab-tty, **`unsupportedTerminalPolicy ∈ {fire, gate}`**) → expected decision. Mocks `exec`. Covers every cell of the decision table including all four modes, both policies (fire AND gate, equally — neither defaulted in the matrix), all failure modes. **Specifically required test cases:**
  - AppleScript exits non-zero with permission-denied stderr → fail-open → `gateDecision: 'fail-open'`
  - AppleScript times out at 200ms → fail-open
  - `ps` returns empty for AI PID (race) → fail-open
  - Process tree walk hits 8-level depth limit → fail-open
  - Shell-hop: ppid is `bash`, ppid's ppid is `claude` → AI PID resolves to claude
  - `unsupportedTerminalPolicy: 'gate'` + Ghostty frontmost + AI's TTY idle 90s → suppress (matches policy a behavior)
  - `unsupportedTerminalPolicy: 'fire'` + Ghostty frontmost → fire regardless of TTY state (matches policy b)
  - VSCode mac frontmost (now classified unsupported) + 'fire' policy → fire
  - VSCode win32 frontmost + per-window PID match → suppress when active editor matches
- `suppress.test.ts` — extend with new gate decisions; ensure PERMISSION still bypasses everything.
- `config.test.ts` — round-trip v1 → migrate → v2 → save → load → still v2. Forward-compat: v2 with extra unknown fields is rejected (strict zod). Backward: v1 still loadable on v2 code.
- `notify.test.ts` — PERMISSION uses `Ping` + sticky on mac; IDLE/TURN_DONE use `Ping` + non-sticky; PERMISSION uses `alarm` scenario on win. Asset resolution: built-in name passed through; absolute path passed through; non-existent custom path falls back to platform default and logs `asset-fallback` once.

### 14.2 Integration (`packages/cli/tests/`)

- `init.test.ts`:
  - First-run: empty home → defaults → config persists → tools wired
  - Re-init: existing config → preselects → enter-through = no diff
  - Re-init: untoggle a tool → uninstall called → config updated
  - `--advanced`: schedule / idle-gate / sound / kinds prompts surface; preselect current
  - `--tools=claude-code --no-test` non-interactive: no prompts; only claude-code wired
  - `--reset`: confirms; wipes; runs first-run flow
  - Lock file: second `init` while first is running → `⚠` exit 1; stale lock → reclaimed
- `project.test.ts` — `project show / set / clear / list / interactive` against a temp config dir
- `migration.test.ts` — write v1 config → run any command → read back → v2 with defaults applied → `<file>.v1.bak` exists

### 14.3 Cross-platform smoke (`scripts/smoke.mjs`)

Add steps:
- Install global tarballs
- Run `init --tools=claude-code --no-test`; verify `~/.claude/settings.json` has hook block + `.bak` exists
- Run `init` again with no flags; verify no diff in config or settings file
- Run `project set --kinds=PERMISSION --enabled=true` in a test dir; `project show` confirms
- Run `reset --yes`; verify config gone, `.bak` restored
- Fire a real notification via `doctor`; manual: confirm sound is Ping

### 14.4 CI matrix

Existing `{macos, windows} × {node 20, 22}` covers it. New tests don't add OS-specific fixtures — they mock `exec`. Real OS-specific tests live in smoke (run on developer machines, documented in `docs/CONTRIBUTING.md#release-smoke`).

### 14.5 Coverage targets

90% lines / 85% branches (unchanged). Each per-terminal dispatch table entry needs at least one fixture test.

## 15 Documentation

- `docs/idle-gate.md` (new) — decision tree, supported terminals, policy choice, troubleshooting (`logs --gate=fail-open`)
- `docs/onboarding.md` (new) — wizard flow, prompt-by-prompt explanation, defaults table
- `docs/project-rules.md` (new) — `project` subcommand examples and recipes
- README — replace install/init snippets with new wizard transcript; add per-project section
- CONTRIBUTING — release-smoke checklist updated with new commands

## 16 Open questions (resolved during brainstorm — locked)

| Question | Locked answer |
|---|---|
| Scope | All three (onboarding, re-init, project config) bundled into one redesign |
| Persona | Progressive disclosure — engineer-friendly default, layman copy, power-user flags |
| Re-init shape | Smart re-init (preselect current values), same `init` command |
| Per-project shape | Dedicated `project` subcommand outside `init` |
| Wizard length | Minimal (≤ 2 prompts); aggressive defaults |
| Idle gate | Process-tree + per-tab TTY where supported; policy (b) — fire on unsupported terminals |
| Sound | Single subtle sound (Ping mac / Notification.Default win); per-kind sticky preserved; user-overridable via built-in name OR absolute custom path |
| Icon | Bundled friendly mark (PNG/ICNS for mac, ICO for win); user-overridable via absolute path; falls back to bundled if user path missing at fire time |
| `agent-notifier` bare | status when configured / init when not |
| Schema | Bump to v2 with auto-migration + one-time `.v1.bak` |

## 17 Risks

- **Per-terminal dispatch table maintenance.** New terminals appear; bundle IDs change. Mitigation: centralized table in one file, fixture-tested per entry, fail-open on unknown.
- **AppleScript permission prompts.** First call to `osascript "tell app System Events..."` may trigger an Accessibility prompt on macOS. Mitigation: document this in the wizard ("macOS may ask for permission the first time — this lets the notifier check which app is in focus"). Surface in `doctor` if denied.
- **Re-init data loss.** A user who edits config by hand and then runs `init` could see their custom edits overwritten. Mitigation: every `init` run writes `<file>.<timestamp>.bak` of the prior config before saving. Recoverable.
- **Ping might be muted at the system level.** Some users mute system sounds entirely. Mitigation: `doctor` includes a "did you hear it?" prompt and links to "if you didn't hear it, check System Settings → Notifications → Terminal/iTerm/etc → Allow sounds."
- **Bundled icon size bloat.** ICNS + PNG + ICO ≈ 100–200 KB. Mitigation: keep source SVG slim, export only sizes we ship (no 1024px), check final tarball size in CI (warn if package > 500 KB).
- **Custom icon path becomes invalid after install.** User points at a path that later moves/deletes. Mitigation: fall back to bundled default at fire time (log once); doctor flags broken custom-icon path.
- **Performance regression in hook hot path.** Adding gate detection adds ~70ms p99. Mitigation: 2s cache; never spawn more than 2 child processes per hook invocation; performance test in CI flags any regression > 200ms.

## 18 Rollout

Single PR, single changeset entry (minor version bump 0.1.0 → 0.2.0). Existing users migrate automatically on first `init` or any command that reads config. README announcement explains:
- Idle-gate fix (the bug they may have hit)
- New `project` subcommand
- `init` is now safe to re-run

## 19 Out of scope (explicit non-goals — for clarity)

- Custom bundled sound asset (revisit if user feedback warrants)
- Per-tab focus for Ghostty / Alacritty / Hyper (no portable API)
- Cross-machine config sync
- GUI preferences pane
- Telemetry
- Auto-update
- Renaming or removing existing commands
