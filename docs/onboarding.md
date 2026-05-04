# Onboarding guide

## First run

Type `agent-notifier` with no arguments on a machine where no config exists yet. The wizard runs automatically.

```
agent-notifier — set up

  Detected on this machine
    ✓ claude-code   ~/.claude/settings.json
    ✓ codex         ~/.codex/config.toml
    ✓ opencode      ~/.config/opencode/...
    ·  gemini        not installed

  › Wire these up? (preselected: all detected)
    We'll back up each config to <file>.agent-notifier.bak before editing.

  › Send a test notification now? (Yes)
    Heads up: macOS may ask permission for agent-notifier to detect which app
    you're focused on — say allow. That's what makes notifications fire only
    when you're not looking at the agent's terminal.

  ✓ Done. You'll get a ping when:
      · an agent asks for permission
      · an agent finishes a turn
      · an agent goes idle for 60s while waiting on you
    …unless you're focused on the same terminal tab the agent is running in.

  Pro tip: `agent-notifier init --advanced` for schedules, sound, gate options.
           `agent-notifier project` (in any project dir) for per-project rules.
```

The wizard takes at most two answers: which tools to wire (preselected to all detected), and whether to send a test notification (default yes). Hit enter twice and you're done.

Each tool's dotfile is backed up to `<file>.agent-notifier.bak` before any change is written. If something goes wrong, run `agent-notifier uninstall` and every file is restored byte-for-byte.

## Re-init

Run `agent-notifier init` again on a machine that already has a config. The wizard is identical except:

- The banner reads `agent-notifier — reconfigure` instead of `agent-notifier — set up`.
- The tools checkbox preselects the tools that are currently wired.
- The test notification defaults to **no** (you already know it works).

Every prompt preselects the current value. Pressing enter through the entire wizard is a no-op — the config is not changed. This means re-running `init` is always safe.

If you have edited `~/.agent-notifier/config.json` by hand, `init` writes a timestamped backup of the old config (`config.json.<ISO-timestamp>.bak`) before saving the new one, so your hand-edits are recoverable.

## Advanced flow (`--advanced`)

```bash
agent-notifier init --advanced
```

After the basic tool-wiring prompt, the advanced flow adds:

1. **Schedule** — none (default) / work hours 09:00–18:00 mon–fri / custom range.
2. **Idle-gate mode** — how the notifier decides whether to fire. See [`docs/idle-gate.md`](idle-gate.md).
3. **Idle threshold** — seconds before treating an active-elsewhere session as needing a ping. Default: 60.
4. **Unsupported-tab policy** — what to do when the terminal can't report which tab is focused. Default: `fire` (notify anyway). See [`docs/idle-gate.md`](idle-gate.md).
5. **Sound** — built-in macOS name (`Ping`, `Glass`, `Hero`, `Pop`, `Tink`) or absolute path to a `.aiff`/`.caf` file. Preview each by listening before confirming. Default: `Ping`.
6. **Custom icon** — absolute path to your own image (`PNG`/`ICNS` on mac, `ICO` on Windows). Default: bundled agent-notifier mark.
7. **Event kinds** — toggle `PERMISSION`, `TURN_DONE`, `IDLE` individually.
8. **Project default** — whether new projects notify by default (yes/no).

Every prompt preselects the current value on re-init. The test notification still runs at the end.

## Non-interactive flags

Any flag passed to `init` makes that field non-interactive. Fields not covered by flags still prompt, unless every relevant field is supplied (then no prompts run at all).

| Flag | Description |
|---|---|
| `--tools <list>` | Comma-separated tool names; bypasses the checkbox. Example: `--tools=claude-code,codex` |
| `--no-test` | Skip the closing test notification |
| `--schedule <range>` | Add an allow-window. Format: `HH:MM-HH:MM`. Requires `--schedule-days` |
| `--schedule-days <days>` | Comma-separated days for the schedule. Example: `mon,tue,wed,thu,fri` |
| `--idle-gate <mode>` | Set idle-gate mode: `fire-elsewhere`, `always-fire`, `strict-terminal`, or `strict-os-idle` |
| `--idle-threshold <s>` | Idle threshold in seconds (default: 60) |
| `--unsupported-tab-policy <p>` | `fire` (default) or `gate` — behavior when the active tab is unknown |
| `--sound <name-or-path>` | Built-in sound name or absolute path to audio file |
| `--icon <path>` | Absolute path to custom notification icon. `--icon=default` resets to bundled |
| `--reset` | Uninstall everything and re-init from scratch. Add `--yes` to skip confirmation |

Full non-interactive example (no prompts):

```bash
agent-notifier init --tools=claude-code,codex --no-test --idle-gate=fire-elsewhere --idle-threshold=60
```

## Defaults table

These are the values chosen when you press enter through the entire wizard.

| Setting | Default | Notes |
|---|---|---|
| Tools | All detected | Every tool found on the machine |
| `global.enabled` | `true` | Global notifications on |
| `projectDefault.enabled` | `true` | New projects notify; opt out per-project |
| `schedules` | `[]` | No time windows; add via `--schedule` or `--advanced` |
| `idleGate.mode` | `fire-elsewhere` | Notify when you're in a different app or tab |
| `idleGate.thresholdSeconds` | `60` | 60 seconds |
| `idleGate.unsupportedTerminalPolicy` | `fire` | Fire when active tab cannot be determined |
| `sound.darwin` | `Ping` | Subtle macOS system bell |
| `sound.win32` | `ms-winsoundevent:Notification.Default` | Standard Windows toast tone |
| `icon.darwin` | bundled (`assets/icon.png`) | agent-notifier mark; not the terminal's icon |
| `icon.win32` | bundled (`assets/icon.ico`) | Same mark on Windows toast |
| `mute` | `null` | Not muted |
| `logging.maxBytes` | `1,000,000` | 1 MB per log file |
| `logging.generations` | `3` | Three rotating files = 3 MB max total |

## FAQ: macOS Accessibility prompt

When you first run a test notification (or when a real notification fires), macOS may display a dialog:

> "agent-notifier" would like to control "System Events"

**Why does it ask?** The notifier uses `osascript` to query System Events for the frontmost application and the active terminal tab. This is how it knows whether you're already looking at the agent's terminal — the thing that prevents you from being paged when you're actively reading the output.

**What to do:** Click Allow. Then go to **System Settings → Privacy & Security → Accessibility** and confirm that `agent-notifier` (or the Node.js binary, depending on your setup) is listed and checked.

**What if you deny it?** The notifier falls back to fail-open: it fires every notification regardless of what tab you're in, as if `idleGate.mode` were `always-fire`. You will not miss notifications; you will just get more of them. `agent-notifier status --verbose` shows `gate-detection-unavailable` in that case.

`agent-notifier doctor` will flag a missing Accessibility permission and tell you the exact System Settings path to fix it.
