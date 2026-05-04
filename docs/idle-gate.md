# Idle gate

## Why

Without a context-switch check, the notifier fires every time an agent finishes — even when you're actively reading its output in the same terminal tab. You don't need a ping for something you're already looking at.

The idle gate solves this: before firing a notification, it checks whether you're focused on the same terminal tab the agent is running in. If you are, it suppresses. If you're in a different app or a different tab, it fires. Permission requests always bypass the gate — when the agent is blocked waiting for you, you always get notified.

## Decision tree

```
Hook fires → classify → produce Event
│
├─ kind == PERMISSION → FIRE (always; agent is blocked, don't gate)
│
└─ kind == IDLE or TURN_DONE:
   │
   ├─ idleGate.mode == always-fire → FIRE
   │
   ├─ idleGate.mode == strict-os-idle → check HIDIdleTime / GetLastInputInfo
   │   └─ idle < thresholdSeconds → SUPPRESS, else → FIRE
   │
   ├─ idleGate.mode == strict-terminal:
   │   ├─ frontmost app == AI's terminal app → SUPPRESS
   │   └─ frontmost app != AI's terminal app → FIRE
   │
   └─ idleGate.mode == fire-elsewhere (default):
       │
       ├─ Walk PPID chain from hook's parent:
       │   · skip intermediate POSIX shells (bash, sh, zsh, fish, dash)
       │   · find AI tool exe (claude, codex, gemini, opencode)
       │   · bounded at 8 levels; fail-open if exceeded
       │
       ├─ Get AI's TTY: ps -o tty= -p <AI PID>
       │
       ├─ Get frontmost app: osascript "frontmost app bundle id"
       │   └─ timeout 200ms; fail-open → FIRE and log gateDecision: fail-open
       │
       ├─ frontmost app != AI's terminal app → FIRE (you're in a different app entirely)
       │
       └─ frontmost app == AI's terminal app:
           ├─ Terminal supports per-tab lookup (Terminal.app, iTerm2):
           │   ├─ active tab TTY == AI's TTY → SUPPRESS (you're on the agent's tab)
           │   └─ active tab TTY != AI's TTY → FIRE (sibling tab)
           │
           ├─ Terminal supports per-tab lookup (Windows Terminal, VSCode/Cursor/Windsurf on Windows):
           │   └─ same logic via Win32 / named pipe; same outcomes
           │
           └─ Terminal does not support per-tab lookup (Ghostty, Alacritty, etc.):
               ├─ unsupportedTerminalPolicy == fire (default) → FIRE
               └─ unsupportedTerminalPolicy == gate → SUPPRESS
```

All failure modes (AppleScript permission denied, timeout, `ps` returns nothing, orphaned process) resolve to **FIRE** — fail-open. The notifier never silently swallows an event because detection failed.

## Modes

Set via `agent-notifier init --advanced` or `agent-notifier init --idle-gate=<mode>`.

| Mode | Behavior |
|---|---|
| `fire-elsewhere` *(default)* | Full decision tree above. Per-tab where the terminal cooperates; falls through to `unsupportedTerminalPolicy` otherwise. |
| `always-fire` | Skip the gate entirely. Fire every event. Useful for testing or users who prefer maximum notifications. |
| `strict-terminal` | Gate the whole terminal app as one unit. If the terminal app is frontmost, suppress. No per-tab lookup attempted. |
| `strict-os-idle` | Legacy: use only `HIDIdleTime` (mac) / `GetLastInputInfo` (win). No frontmost or tab awareness. Escape hatch for unusual desktop setups. |

## Supported terminals

### macOS — per-tab focus detection

| Terminal | Bundle ID | Support |
|---|---|---|
| Terminal.app | `com.apple.Terminal` | Full per-tab via AppleScript |
| iTerm2 | `com.googlecode.iterm2` | Full per-tab via AppleScript |

### macOS — falls through to `unsupportedTerminalPolicy`

| Terminal | Bundle ID | Notes |
|---|---|---|
| Ghostty | `com.mitchellh.ghostty` | No introspection API |
| Alacritty | `org.alacritty` | No introspection API |
| kitty | `net.kovidgoyal.kitty` | Supported only when remote-control is enabled (`kitty @ ls`); otherwise policy fallback |
| WezTerm | `com.github.wez.wezterm` | Supported only when the WezTerm daemon is running (`wezterm cli get-pane-info`); otherwise policy fallback |
| Hyper | `co.zeit.hyper` | No introspection API |
| VSCode / Cursor / Windsurf | `com.microsoft.VSCode`, `com.todesktop.230313mzl4w4u92`, `com.exafunction.windsurf` | Not supported on macOS — child shell ownership not determinable via portable API |
| Zed | — | No introspection API |
| Warp | — | No introspection API |

### Windows — per-window focus detection

| Terminal | Process name | Support |
|---|---|---|
| Windows Terminal (1.16+) | `WindowsTerminal.exe` | Full per-pane via JSON-RPC named pipe |
| VSCode / Cursor / Windsurf | `Code.exe`, `Cursor.exe`, `Windsurf.exe` | Per-window via Win32 `GetForegroundWindow` + child process walk |

### Windows — falls through to `unsupportedTerminalPolicy`

All other Windows terminals (ConEmu, Hyper, Alacritty, etc.) fall back to `unsupportedTerminalPolicy`.

### tmux / screen / multiplexers

When `tmux` or `screen` is detected in the process tree, the notifier falls back to `unsupportedTerminalPolicy`. Per-pane detection inside multiplexers is not implemented in v2.

## Unsupported terminal policy

When `idleGate.mode` is `fire-elsewhere` and the terminal does not expose active-tab focus, this setting decides what happens.

| Value | Behavior | Recommendation |
|---|---|---|
| `fire` *(default)* | Fire the notification even though we can't confirm you're on a different tab. You may get a ping while looking at the agent's output. | Recommended for most users. Never miss a notification. |
| `gate` | Treat the whole terminal app as in-focus and suppress. You will not be paged while that terminal app is frontmost, regardless of which tab. | Choose this if you get too many notifications on Ghostty / Alacritty. |

Set via `agent-notifier init --unsupported-tab-policy=fire|gate`.

## Troubleshooting

**I'm getting too many notifications in Ghostty / Alacritty.**
Set the policy to `gate`:
```bash
agent-notifier init --unsupported-tab-policy=gate
```

**I'm not getting notifications when I expect them.**
Check whether gate detection failed. Run:
```bash
agent-notifier logs --tail=20
```
Each entry has a `gateDecision` field. `fail-open` means a detection probe failed (AppleScript permission denied? `ps` timeout?). `frontmost-same-tab` means the notifier correctly detected you were on the agent's tab and suppressed.

For live gate diagnostics:
```bash
agent-notifier status --verbose
```
This shows the current mode, threshold, and policy under the `Idle gate` section.

**macOS Accessibility permission denied.**
`agent-notifier doctor` flags this. The fix is **System Settings → Privacy & Security → Accessibility** — find agent-notifier (or the Node.js binary running it) and check the box. After granting permission, subsequent hook fires will use full per-tab detection.

**The `gateDecision` field is always `fail-open`.**
This usually means the osascript call is timing out (200ms budget). It can happen if System Events is slow to respond after a cold start. Run `agent-notifier doctor` — it fires a test notification and logs the result, making it easy to see whether the detection path is working.
