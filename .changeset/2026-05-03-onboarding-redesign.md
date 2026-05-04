---
"agent-notifier": minor
"@agent-notifier/core": minor
---

Onboarding redesign: layman-friendly first-run wizard, safe re-init that preselects current state, dedicated `project` subcommand for per-project rules, and a redesigned idle gate that fires the moment you context-switch away from your AI agent's terminal tab. Notifications now use a single subtle sound (Ping on mac / system default on win) and a bundled friendly icon, both overridable with your own audio/image files. Schema bumps to v2 with auto-migration from v1 (one-time `.v1.bak` snapshot before upgrade).

New commands and flags:
- `agent-notifier` (no args) → smart routing: init wizard if no config, status otherwise
- `agent-notifier project [show|set|clear|list]` → per-project notification rules
- `agent-notifier reset [--yes]` → uninstall hooks + delete config (preserves logs)
- `agent-notifier init --advanced` → idle gate mode, threshold, sound, icon, schedule prompts
- `agent-notifier init --tools=<list>`, `--no-test`, `--reset` → non-interactive flags
- `agent-notifier status --verbose` / `--json` → richer output and machine-readable mode
- Universal flags: `--quiet`, `--json`, `--no-color`, `--debug` on every command

Internal:
- New `decideGate` decision tree (10 reasons, 2-second cache, fail-open on any OS-probe error) replaces the old binary `idleSeconds < threshold` check
- Bundled icon binaries (PNG/ICNS/ICO) generated from a single SVG via `pnpm gen:icons`
- PID-aware init lock prevents concurrent setup
- `lib/ui.ts` brand vocabulary (locked symbol set, error formatter, TTY-aware spinner)
