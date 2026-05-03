# agent-notifier

Cross-platform desktop notifications for AI coding CLIs. Get a Mac or Windows ping the moment Claude Code, OpenAI Codex, Gemini CLI, or OpenCode needs your attention — permission requests, idle prompts, finished turns. One install, every agent, every machine.

[![CI](https://github.com/<owner>/agent-notifier/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/agent-notifier/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/agent-notifier.svg)](https://www.npmjs.com/package/agent-notifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Why

Multi-minute build, you step away, Claude blocks on a permission prompt — you don't notice for 20 minutes. agent-notifier fires a sticky alert the moment that happens. Idle prompts get a soft chime. Turn-done gets a quick banner. Each event has its own sound so you can identify it without looking.

## Install (60 seconds)

```bash
npm install -g agent-notifier
agent-notifier install        # auto-detects every supported CLI and wires up its hooks
agent-notifier init           # optional: interactive setup (tz, work hours, defaults)
agent-notifier doctor         # fires test notifications to confirm everything works
```

## Supported tools

| Tool | macOS | Windows | Hook surface |
|---|---|---|---|
| Claude Code | ✅ | ✅ | `Notification`, `Stop` |
| OpenAI Codex CLI | ✅ | ✅ | `PermissionRequest`, `Stop` |
| Gemini CLI (≥ 0.26) | ✅ | ✅ | `Notification`, `AfterAgent` |
| OpenCode (sst) | ✅ | ✅ | plugin file, `permission.requested`, `session.completed` |

## Manage

```bash
agent-notifier status                     # show current config + recent log
agent-notifier disable                    # turn off for current project
agent-notifier enable --tool codex        # turn back on for a specific tool
agent-notifier mute 2h                    # quiet everything for two hours
agent-notifier mute "until 17:00"         # quiet until a specific time
agent-notifier unmute
agent-notifier schedule add --allow --days mon-fri --from 09:00 --to 18:00 --id work
agent-notifier schedule list
agent-notifier logs --tail 20             # see what fired and why
agent-notifier logs --suppressed          # see what was filtered, with reason
agent-notifier doctor                     # health check + test pings
agent-notifier uninstall                  # restore everything; no traces left
```

## Privacy

Zero telemetry. Zero network calls. All state lives in `~/.agent-notifier/` (mac) or `%APPDATA%\agent-notifier\` (win). Logs contain only metadata (event kind, project name, session id, suppression reason) — never the contents of your prompts.

## Contributing

See `CONTRIBUTING.md`. New tool adapters welcome — implementing one takes ~50 lines.

## License

MIT — see `LICENSE`.
