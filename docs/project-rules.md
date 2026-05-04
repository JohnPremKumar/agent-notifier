# Per-project rules

## Why

Global notifications are on by default. But some projects generate a lot of activity and you may not want to be paged for every turn-done in a noisy monorepo while you're heads-down in a different repo.

Per-project rules let you override the global default for a specific directory without turning off notifications everywhere. You can disable a project entirely, or narrow it to only the event kinds you care about (e.g., only fire on permission requests, not turn-done).

Rules are stored centrally in `~/.agent-notifier/config.json` — not in the project directory itself.

## Interactive editor

Run this inside any project directory:

```bash
cd ~/repos/my-project
agent-notifier project
```

```
agent-notifier — project rules

  Project   my-project
  Path      ~/repos/my-project
  Status    not configured (default rules apply: all kinds, notify on)

  › Notify for this project? (Yes)
  › Which events?
    [x] PERMISSION    agent asks for approval
    [x] TURN_DONE     agent finishes a turn
    [x] IDLE          agent waiting on you for 60s+

  ✓ saved. Run `agent-notifier project show` to confirm.
```

When project rules already exist, every prompt preselects the current value. Pressing enter through the wizard is a no-op.

## Non-interactive examples

**Silence a noisy project:**
```bash
cd ~/repos/big-monorepo
agent-notifier project set --enabled=false
```

**Only fire on permission requests for this project:**
```bash
agent-notifier project set --kinds=PERMISSION
```

**Fire on all event kinds (clear any kind filter):**
```bash
agent-notifier project set --kinds=all
```

**Combine options in one command:**
```bash
agent-notifier project set --enabled=true --kinds=PERMISSION,IDLE
```

**Target a project by path instead of cwd:**
```bash
agent-notifier project set --enabled=false --project=/absolute/path/to/project
```

**Show the effective rules for the current project:**
```bash
agent-notifier project show
agent-notifier project show --json     # machine-readable
```

**List all configured projects:**
```bash
agent-notifier project list
agent-notifier project list --json
```

**Remove rules for the current project (falls back to global default):**
```bash
agent-notifier project clear
agent-notifier project clear --yes     # skip confirmation
```

## Project keys

Project rules are keyed by a stable identifier derived from the project's root directory. The `resolveProjectKey()` function walks up the directory tree from the current working directory until it finds a `.git` directory, then uses that path as the key.

This means:
- The same git repo gets the same key regardless of which subdirectory you're in when you run the command.
- Worktrees (`git worktree add`) each have their own `.git` file pointing back to the main repo — the key resolves to the worktree root, not the main repo root. This means each worktree gets its own independent project rules.
- Non-git directories fall back to using the cwd itself as the key. If you work in `/tmp/scratch`, the key is `/tmp/scratch`.

You can see the resolved key for any directory:
```bash
agent-notifier project show --json | grep '"project"'
```

Or by running `agent-notifier status` from inside the project — the `This project` section shows the resolved display name and whether any rules are configured.
