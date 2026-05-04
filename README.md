# agent-notifier

Cross-platform desktop notifications for AI coding CLIs. Get a Mac or Windows ping the moment Claude Code, OpenAI Codex, Gemini CLI, or OpenCode needs your attention — permission requests, idle prompts, finished turns. One install, every agent, every machine.

[![CI](https://github.com/<owner>/agent-notifier/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/agent-notifier/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/agent-notifier.svg)](https://www.npmjs.com/package/agent-notifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Why

Multi-minute build, you step away, Claude blocks on a permission prompt — you don't notice for 20 minutes. agent-notifier fires a sticky alert the moment that happens. When an agent finishes a turn or goes idle, you get a quick ping — but only if you're not already looking at that terminal tab.

## Quick start

```bash
npm install -g agent-notifier
agent-notifier
```

Type `agent-notifier` with no arguments. The wizard detects which AI CLIs you have installed, wires them up, and fires a test notification. Re-run anytime — the wizard preselects what's already wired and only asks about what's changed.

## What you get

- **Per-tab notifications** — when your AI agent finishes a turn or asks for permission, you get a desktop notification only if you're not actively in that terminal tab. Switching to your browser? You hear about it. Reading the agent's output? You don't.
- **Friendly defaults** — single subtle sound (Ping on mac, system default on win), bundled icon, all overridable.
- **Per-project rules** — `cd ~/repos/noisy-project && agent-notifier project set --enabled=false` silences just that project.
- **Safe re-init** — re-running the wizard never loses your custom settings; it preselects current state and only writes what you change.

## Supported tools

| Tool | macOS | Windows | Hook surface |
|---|---|---|---|
| Claude Code | ✅ | ✅ | `Notification`, `Stop` |
| OpenAI Codex CLI | ✅ | ✅ | `PermissionRequest`, `Stop` |
| Gemini CLI (≥ 0.26) | ✅ | ✅ | `Notification`, `AfterAgent` |
| OpenCode (sst) | ✅ | ✅ | plugin file, `permission.requested`, `session.completed` |

## Customizing the sound

Built-in mac sound names work directly:
```bash
agent-notifier init --advanced --sound=Tink
```
Or point at any audio file:
```bash
agent-notifier init --advanced --sound=/path/to/your.aiff   # mac (.aiff or .caf)
agent-notifier init --advanced --sound=C:\sounds\ping.wav   # win (.wav)
```

## Customizing the icon

```bash
agent-notifier init --advanced --icon=/path/to/your.png      # mac (.png or .icns)
agent-notifier init --advanced --icon=C:\icons\agent.ico     # win (.ico)
```

## Per-project rules

See [`docs/project-rules.md`](docs/project-rules.md). Quick example:

```bash
cd ~/repos/big-project
agent-notifier project set --enabled=true --kinds=PERMISSION
# Now this project only notifies on permission requests, not turn-done.
```

## Idle gate

See [`docs/idle-gate.md`](docs/idle-gate.md) for how the per-tab detection works and which terminals support it.

## Other commands

```bash
agent-notifier status                     # current config + recent notification log
agent-notifier status --verbose           # extra detail (gate mode, full schedule, log path)
agent-notifier status --json              # machine-readable
agent-notifier logs --tail=20             # last 20 log entries
agent-notifier logs --suppressed          # see what was filtered, with reason
agent-notifier mute 1h                    # temporary global mute
agent-notifier mute "until 17:00"         # mute until a specific time
agent-notifier unmute
agent-notifier schedule add --allow --days mon-fri --from 09:00 --to 18:00 --id work
agent-notifier schedule list
agent-notifier doctor                     # diagnose wiring + fire test notifications
agent-notifier reset --yes                # uninstall everything and start over
agent-notifier uninstall                  # restore dotfiles; no traces left
```

## Privacy

Zero telemetry. Zero network calls. All state lives in `~/.agent-notifier/` (mac) or `%APPDATA%\agent-notifier\` (win). Logs contain only metadata (event kind, project name, session id, suppression reason) — never the contents of your prompts.

## Contributing

See `CONTRIBUTING.md`. New tool adapters welcome — implementing one takes ~50 lines.

## License

MIT — see `LICENSE`.
