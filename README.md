<div align="center">

# `agnt` — desktop notifications for AI coding CLIs

**Get a Mac or Windows ping the moment Claude Code, Codex, Gemini, or OpenCode needs your attention.**

Permission requests. Idle prompts. Finished turns. One install, every agent, every machine.

[![npm version](https://img.shields.io/npm/v/agent-notifier.svg?color=blue&label=npm)](https://www.npmjs.com/package/agent-notifier)
[![npm downloads](https://img.shields.io/npm/dm/agent-notifier.svg?color=blue)](https://www.npmjs.com/package/agent-notifier)
[![CI](https://github.com/JohnPremKumar/agent-notifier/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnPremKumar/agent-notifier/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/node/v/agent-notifier.svg)](https://nodejs.org)

```bash
npm install -g agent-notifier
agnt
```

That's it. The wizard detects every AI CLI you have, wires it up, and fires a test notification. Done in under 30 seconds.

</div>

---

## Why you want this

You ask Claude Code to refactor a module. It thinks for 90 seconds. You alt-tab to read a doc. Two minutes later you come back — it's been blocked on a permission prompt for 80 of those seconds.

`agnt` fires a desktop notification the instant your agent needs you. It only pings when you're **not** already looking at that terminal tab — switch to your browser, you hear about it; stay on the agent, no noise.

Works with **every major AI coding CLI** in one install:

| Tool | macOS | Windows | Events |
|---|:---:|:---:|---|
| **[Claude Code](https://claude.com/claude-code)** | ✅ | ✅ | permissions, turn-done |
| **[OpenAI Codex CLI](https://github.com/openai/codex)** | ✅ | ✅ | permissions, turn-done |
| **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** (≥ 0.26) | ✅ | ✅ | notifications, turn-done |
| **[OpenCode](https://opencode.ai)** | ✅ | ✅ | `permission.ask`, `session.idle` |

## Quick start

```bash
# Install
npm install -g agent-notifier

# Run the wizard (detects + wires every AI CLI on your system)
agnt
```

> **The short alias `agnt` is the recommended way to use this CLI.** The full name `agent-notifier` works too — both binaries are installed.

The first run takes you through:
1. Which CLIs to wire up (auto-detected, you can deselect)
2. Which event kinds to notify on (permission / idle / turn-done)
3. A live test notification so you can confirm the sound and icon

Re-run `agnt` anytime — the wizard preselects your current state and only asks about what's changed.

## Features at a glance

- 🎯 **Per-tab smart gating** — only fires when you're not actively in the agent's terminal. Detects iTerm, Terminal.app, Warp, Alacritty, Kitty, WezTerm, Hyper, VS Code, Cursor, Windsurf, Windows Terminal, and more.
- 🔇 **Quick mute** — `agnt mute 1h`, `agnt mute "until 17:00"`, then `agnt unmute`.
- 📅 **Schedule** — quiet hours, work hours, weekends. `agnt schedule add --deny --days sat,sun`.
- 📁 **Per-project rules** — silence noisy projects without globally muting. `cd ~/repos/x && agnt project set --enabled=false`.
- 🎨 **Custom sound + icon** — point at any `.aiff`/`.wav`/`.png`/`.ico`. Subtle defaults out of the box.
- 🩺 **Doctor** — `agnt doctor` diagnoses wiring, fires test pings, shows recent log.
- 🛡️ **Safe install/uninstall** — backs up every dotfile we touch, restores cleanly. Zero traces after `agnt uninstall`.
- 🚫 **Zero telemetry** — no network calls, ever. All state local. Logs contain metadata only, never prompt content.

## Common commands

```bash
agnt                     # smart routing: wizard if no config, status otherwise
agnt status              # current config + recent notification log
agnt status --verbose    # everything: gate mode, full schedule, log path
agnt status --json       # machine-readable

agnt logs --tail=20      # last 20 notifications
agnt logs --suppressed   # see what was filtered, with reason

agnt mute 1h             # temporary global mute
agnt mute "until 17:00"  # mute until a specific time
agnt unmute

agnt schedule add --allow --days mon-fri --from 09:00 --to 18:00 --id work
agnt schedule list

agnt project set --enabled=true --kinds=PERMISSION   # this project: only permission pings
agnt project clear                                   # remove this project's rules
agnt project list                                    # show all per-project rules

agnt doctor              # diagnose wiring, fire test notifications
agnt reset --yes         # uninstall hooks + delete config (keeps logs)
agnt uninstall           # restore dotfiles; no traces left
```

Every command supports `--quiet`, `--json`, `--no-color`, `--debug`.

## Customization

### Sound

Built-in macOS sound names work directly:
```bash
agnt init --advanced --sound=Tink   # mac: any name from /System/Library/Sounds
```

Or point at any audio file:
```bash
agnt init --advanced --sound=/path/to/your.aiff   # mac (.aiff, .caf)
agnt init --advanced --sound=C:\sounds\ping.wav   # win (.wav)
```

### Icon

```bash
agnt init --advanced --icon=/path/to/your.png   # mac (.png, .icns)
agnt init --advanced --icon=C:\icons\agent.ico  # win (.ico)
```

### Idle gate behavior

The default ("fire when elsewhere") only notifies if your active app isn't the AI's terminal. Want different behavior? See [`docs/idle-gate.md`](docs/idle-gate.md) for `always-fire`, `os-idle`, and threshold tuning.

## Documentation

- 📘 **[Onboarding guide](docs/onboarding.md)** — what the wizard does, advanced flags, non-interactive setup
- 📗 **[Idle gate](docs/idle-gate.md)** — per-tab detection, supported terminals, custom thresholds
- 📕 **[Per-project rules](docs/project-rules.md)** — silence specific repos, kind-by-kind filters
- 📙 **[Contributing](CONTRIBUTING.md)** — adding a new tool adapter (~50 lines)

## How it works

```
┌──────────────────────┐                ┌─────────────────────┐
│  Claude / Codex /    │   hook fires   │  agnt hook          │
│  Gemini / OpenCode   │ ───────────►  │  classify → gate →  │
│  (your AI CLI)       │   stdin JSON   │  log → notify       │
└──────────────────────┘                └──────────┬──────────┘
                                                   │
                                                   ▼
                                       ┌────────────────────────┐
                                       │  node-notifier         │
                                       │  (mac alerter / win    │
                                       │   SnoreToast)          │
                                       └────────────────────────┘
```

`agnt` installs as a hook in each AI CLI's config (Claude `settings.json`, Codex `config.toml`, Gemini `settings.json`, OpenCode plugin file). When the agent fires an event, our hook runs in <50ms, classifies it, checks the per-tab idle gate, then either notifies you or logs the suppression reason.

## Privacy

- **Zero telemetry.** Never phones home.
- **Zero network calls.** Everything runs locally.
- **State lives in `~/.agent-notifier/`** on macOS, `%APPDATA%\.agent-notifier\` on Windows.
- **Logs contain metadata only** — event kind, project name, session id, suppression reason. Never your prompts, never agent output.

## Roadmap

- Linux support (currently macOS + Windows)
- More CLI adapters (Aider, Continue, ...)
- Notification grouping / coalescing for chatty agents

Have a tool you want supported? [Open an issue](https://github.com/JohnPremKumar/agent-notifier/issues/new) — adapters are ~50 lines of code.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The codebase is TypeScript strict, monorepo (`packages/core` + `packages/cli`), 90% line coverage, both-OS CI matrix.

## License

[MIT](LICENSE) © Johnpremkumar Srinivasan

---

<div align="center">

**Star this repo ⭐ if `agnt` saved you from missing another permission prompt.**

Made with care for the AI-coding-CLI community. Submit issues or PRs at [github.com/JohnPremKumar/agent-notifier](https://github.com/JohnPremKumar/agent-notifier).

</div>
