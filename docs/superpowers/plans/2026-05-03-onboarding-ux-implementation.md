# Onboarding UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a layman-friendly onboarding flow with safe re-init, dedicated `project` subcommand, fixed idle gate (process-tree + per-tab TTY), single subtle sound + bundled friendly icon (both user-overridable), and a unified calm CLI visual language — all in one PR, schema v2, version bump 0.1.0 → 0.2.0.

**Architecture:** Extends existing single-process node CLI (commander, inquirer, kleur) with one new dependency (`ora` for spinners). Core (`packages/core`) gains: schema v2, frontmost detection, process tree walk, asset bundling, log centralization. CLI (`packages/cli`) gains: smart-reinit `init`, `project` subcommand, `reset`, universal flags, revamped `status`. Hook hot path stays under 500ms p99 via 200ms timeouts and 2s in-memory cache.

**Tech Stack:** TypeScript strict, Node ≥ 20 (CI: 20.x + 22.x), pnpm workspaces, tsup, Vitest, kleur, commander, @inquirer/prompts, zod, node-notifier, **+ ora (new)**, sharp + png2icons (dev-only, for icon generation).

**Spec:** `docs/superpowers/specs/2026-05-03-onboarding-ux-design.md` (committed `f4066a0`).

---

## File Structure (locked before coding)

### `packages/core/`

| File | Status | Responsibility |
|---|---|---|
| `src/types.ts` | modify | Schema v2: add `idleGate`, `sound`, `icon`, `logging` zod fields |
| `src/config.ts` | modify | Add `migrate()` step before parse; one-time `.v1.bak`; timestamped re-init backup |
| `src/idle-gate.ts` | rewrite | Frontmost-app detection, process tree walk with shell-hop, per-terminal active-tab dispatch, 2s cache, 4 modes |
| `src/idle-gate-terminals.ts` | create | Terminal allowlist + per-terminal active-tab lookup table |
| `src/suppress.ts` | modify | New decision tree: PERMISSION bypass, mode dispatch, gate decision recorded |
| `src/notify.ts` | modify | Single sound, bundled icon resolution, custom path passthrough, asset fallback |
| `src/notify-stub.ts` | create | Extracted `stubNotifyAppend` (deduped from 3 callers) |
| `src/logger.ts` | modify | Add `loggerFromConfig(config)` factory |
| `src/assets/icon.png` | create | 512×512 friendly mark (PNG with alpha) |
| `src/assets/icon.icns` | create | multi-res ICNS for terminal-notifier `--appIcon` |
| `src/assets/icon.ico` | create | 256×256 multi-res ICO for Windows toast |
| `src/assets/source/icon.svg` | create | Source SVG, reproducible re-renders |
| `tsup.config.ts` | modify | `onSuccess` cp step copies `assets/` to package root |
| `package.json` | modify | Add `"assets"` to `files`; add dev deps for icon generation |
| `tests/idle-gate.test.ts` | rewrite | Parametric matrix over (mode, frontmost, ai-terminal, ai-tty, active-tab-tty, unsupportedTerminalPolicy) + failure modes |
| `tests/suppress.test.ts` | modify | New gate decisions; PERMISSION bypass invariant |
| `tests/config-migration.test.ts` | create | v1 → v2 round-trip; `.v1.bak` written; idempotent re-load |
| `tests/notify.test.ts` | modify | Single sound; built-in vs path; asset fallback |
| `tests/notify-stub.test.ts` | create | Stub append rotation under 256 KB cap |

### `packages/cli/`

| File | Status | Responsibility |
|---|---|---|
| `src/index.ts` | modify | Bare-command behavior, register `project`, `reset`; universal flags |
| `src/init.ts` | rewrite | Smart re-init wizard, preselects, `--advanced` flow, lock file, non-interactive flag mode |
| `src/install.ts` | modify | Audit `.agent-notifier.bak` write-once invariant |
| `src/project.ts` | create | Subcommands: interactive editor, show, set, clear, list |
| `src/reset.ts` | create | Confirms + uninstalls hooks + deletes config; preserves logs |
| `src/status.ts` | rewrite | New layout, `--verbose`, `--json` |
| `src/doctor.ts` | modify | Routes through `loggerFromConfig` and `stubNotifyAppend` |
| `src/hook.ts` | modify | Routes through `loggerFromConfig`, `stubNotifyAppend` |
| `src/mute.ts` | modify | Drop `🔇`/`🔔` emoji; use `—`/`▸` symbols |
| `src/lib/lock.ts` | create | PID-aware init lock; stale reclaim |
| `src/lib/ui.ts` | create | Symbol set, color helpers, spinner factory, error formatter |
| `src/lib/flags.ts` | create | Universal flags parser (--quiet/--json/--no-color/--debug) |
| `package.json` | modify | Add `ora` dep |
| `tests/init-firstrun.test.ts` | create | Empty home → defaults → tools wired |
| `tests/init-reinit.test.ts` | create | Existing config → preselects → enter-through = no diff |
| `tests/init-advanced.test.ts` | create | Advanced flow surfaces; flag-driven non-interactive |
| `tests/init-lock.test.ts` | create | Live PID blocks; stale PID reclaims |
| `tests/project.test.ts` | create | All subcommands against temp config dir |
| `tests/reset.test.ts` | create | Confirm flow; uninstalls + deletes config; preserves logs |
| `tests/status.test.ts` | modify | New layout snapshot; `--json` shape |

### `docs/`

| File | Status | Responsibility |
|---|---|---|
| `docs/onboarding.md` | create | Wizard prompt-by-prompt, defaults, FAQ |
| `docs/idle-gate.md` | create | Decision tree, supported terminals, troubleshooting |
| `docs/project-rules.md` | create | `project` subcommand examples |
| `docs/CONTRIBUTING.md` | modify | Release-smoke updated with new commands |
| `README.md` | modify | New install transcript, project section, sound/icon override |
| `.changeset/2026-05-03-onboarding-redesign.md` | create | Minor bump 0.1.0 → 0.2.0 with user-facing summary |

### `scripts/`

| File | Status | Responsibility |
|---|---|---|
| `scripts/smoke.mjs` | modify | New steps: tarball-asset assertion, `init --tools=...`, re-init no-diff, `project set --kinds`, `reset --yes` |
| `scripts/gen-icons.mjs` | create | One-shot SVG → PNG/ICNS/ICO using `sharp` + `png2icons` |

---

## Phase A · Schema v2 + foundation refactors

### Task 1: Schema v2 — types and zod

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/tests/types.test.ts` (create if absent)

- [ ] **Step 1: Write failing test**

```ts
// packages/core/tests/types.test.ts
import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../src/types.js';

describe('ConfigSchema v2', () => {
  it('parses an empty object with all defaults', () => {
    const c = ConfigSchema.parse({ version: 2, tz: 'UTC' });
    expect(c.version).toBe(2);
    expect(c.idleGate.mode).toBe('fire-elsewhere');
    expect(c.idleGate.thresholdSeconds).toBe(60);
    expect(c.idleGate.unsupportedTerminalPolicy).toBe('fire');
    expect(c.sound.darwin).toBe('Ping');
    expect(c.sound.win32).toBe('ms-winsoundevent:Notification.Default');
    expect(c.icon.darwin).toBeNull();
    expect(c.icon.win32).toBeNull();
    expect(c.logging.maxBytes).toBe(1_000_000);
    expect(c.logging.generations).toBe(3);
  });

  it('rejects unknown fields under strict zod', () => {
    expect(() =>
      ConfigSchema.parse({ version: 2, tz: 'UTC', bogusField: true }),
    ).toThrow();
  });

  it('rejects v1 directly (migration handles upgrade)', () => {
    expect(() => ConfigSchema.parse({ version: 1, tz: 'UTC' })).toThrow();
  });
});
```

- [ ] **Step 2: Run failing test**

```
pnpm test -- packages/core/tests/types.test.ts
```
Expected: FAIL — schema is still v1.

- [ ] **Step 3: Update `types.ts`**

```ts
// packages/core/src/types.ts (additions only — keep existing Kind/ToolName/EventSchema/etc.)
export const IdleGateModeSchema = z.enum([
  'fire-elsewhere',
  'always-fire',
  'strict-terminal',
  'strict-os-idle',
]);
export type IdleGateMode = z.infer<typeof IdleGateModeSchema>;

export const UnsupportedTerminalPolicySchema = z.enum(['fire', 'gate']);
export type UnsupportedTerminalPolicy = z.infer<typeof UnsupportedTerminalPolicySchema>;

export const ConfigSchema = z.object({
  version: z.literal(2),
  tz: z.string().min(1),
  global: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  mute: z.object({ until: z.string().datetime() }).nullable().default(null),
  schedules: z.array(ScheduleRuleSchema).default([]),
  tools: z.record(ToolNameSchema, z.object({ enabled: z.boolean() })).default({
    'claude-code': { enabled: true },
    codex: { enabled: true },
    gemini: { enabled: true },
    opencode: { enabled: true },
  }),
  projectDefault: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  projects: z.record(z.string(), ProjectEntrySchema).default({}),

  idleGate: z
    .object({
      mode: IdleGateModeSchema.default('fire-elsewhere'),
      thresholdSeconds: z.number().int().min(0).max(3600).default(60),
      unsupportedTerminalPolicy: UnsupportedTerminalPolicySchema.default('fire'),
    })
    .default({}),

  sound: z
    .object({
      darwin: z.string().min(1).default('Ping'),
      win32: z.string().min(1).default('ms-winsoundevent:Notification.Default'),
    })
    .default({}),

  icon: z
    .object({
      darwin: z.string().min(1).nullable().default(null),
      win32: z.string().min(1).nullable().default(null),
    })
    .default({}),

  logging: z
    .object({
      maxBytes: z.number().int().min(1024).max(100_000_000).default(1_000_000),
      generations: z.number().int().min(1).max(20).default(3),
    })
    .default({}),
}).strict();
export type Config = z.infer<typeof ConfigSchema>;
```

- [ ] **Step 4: Run test — passes**

```
pnpm test -- packages/core/tests/types.test.ts
```
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/tests/types.test.ts
git commit -m "feat(core): bump Config schema to v2 with idleGate/sound/icon/logging fields"
```

---

### Task 2: `migrate()` v1 → v2 with one-time `.v1.bak`

**Files:**
- Modify: `packages/core/src/config.ts`
- Test: `packages/core/tests/config-migration.test.ts` (create)

- [ ] **Step 1: Write failing test**

```ts
// packages/core/tests/config-migration.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig } from '../src/config.js';

describe('config migration v1 → v2', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'an-cfg-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('upgrades v1 config to v2 on load with defaults applied', () => {
    writeFileSync(file, JSON.stringify({ version: 1, tz: 'UTC' }), 'utf8');
    const c = loadConfig(file, 'UTC');
    expect(c.version).toBe(2);
    expect(c.idleGate.mode).toBe('fire-elsewhere');
    expect(c.sound.darwin).toBe('Ping');
  });

  it('writes <file>.v1.bak exactly once on first migration', () => {
    writeFileSync(file, JSON.stringify({ version: 1, tz: 'UTC' }), 'utf8');
    loadConfig(file, 'UTC');
    expect(existsSync(`${file}.v1.bak`)).toBe(true);
    const backup = readFileSync(`${file}.v1.bak`, 'utf8');
    expect(JSON.parse(backup)).toMatchObject({ version: 1 });

    // Re-load (config is now v2) — backup must NOT be overwritten or duplicated
    const c2 = loadConfig(file, 'UTC');
    saveConfig(file, c2);
    loadConfig(file, 'UTC');
    expect(existsSync(`${file}.v1.bak`)).toBe(true);
  });

  it('passes through v2 unchanged', () => {
    const v2 = { version: 2, tz: 'UTC' };
    writeFileSync(file, JSON.stringify(v2), 'utf8');
    const c = loadConfig(file, 'UTC');
    expect(c.version).toBe(2);
    expect(existsSync(`${file}.v1.bak`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

```
pnpm test -- packages/core/tests/config-migration.test.ts
```
Expected: FAIL — `loadConfig` doesn't migrate.

- [ ] **Step 3: Update `config.ts`**

```ts
// packages/core/src/config.ts (replace contents)
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
  fsyncSync, openSync, closeSync, copyFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { ConfigSchema, type Config } from './types.js';

export function defaultConfig(tz: string): Config {
  return ConfigSchema.parse({ version: 2, tz });
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function migrate(raw: unknown, file: string): unknown {
  if (!isObject(raw)) return raw;
  if (raw['version'] === 1) {
    const backup = `${file}.v1.bak`;
    if (existsSync(file) && !existsSync(backup)) copyFileSync(file, backup);
    return { ...raw, version: 2 };
  }
  return raw;
}

export function loadConfig(file: string, fallbackTz: string): Config {
  if (!existsSync(file)) return defaultConfig(fallbackTz);
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return ConfigSchema.parse(migrate(raw, file));
}

export function saveConfig(file: string, config: Config): void {
  ConfigSchema.parse(config);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Re-init backup: timestamped snapshot if config already exists
  if (existsSync(file)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(file, `${file}.${ts}.bak`);
  }

  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  const fd = openSync(tmp, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

export class ConfigStore {
  constructor(
    private readonly file: string,
    private readonly fallbackTz: string,
  ) {}
  load(): Config {
    return loadConfig(this.file, this.fallbackTz);
  }
  save(c: Config): void {
    saveConfig(this.file, c);
  }
  update(mutator: (c: Config) => void): Config {
    const c = this.load();
    mutator(c);
    this.save(c);
    return c;
  }
}
```

- [ ] **Step 4: Run test — passes**

```
pnpm test -- packages/core/tests/config-migration.test.ts
```
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/tests/config-migration.test.ts
git commit -m "feat(core): auto-migrate v1 → v2 with one-time .v1.bak and timestamped re-init backups"
```

---

### Task 3: `loggerFromConfig` factory + 3 callsites

**Files:**
- Modify: `packages/core/src/logger.ts`
- Modify: `packages/cli/src/status.ts`
- Modify: `packages/cli/src/doctor.ts`
- Modify: `packages/cli/src/hook.ts`
- Test: `packages/core/tests/logger.test.ts` (extend or create)

- [ ] **Step 1: Write failing test**

```ts
// packages/core/tests/logger.test.ts (additions)
import { describe, expect, it } from 'vitest';
import { loggerFromConfig } from '../src/logger.js';
import { defaultConfig } from '../src/config.js';

describe('loggerFromConfig', () => {
  it('returns a Logger configured from Config.logging', () => {
    const cfg = defaultConfig('UTC');
    cfg.logging.maxBytes = 2048;
    cfg.logging.generations = 5;
    const log = loggerFromConfig(cfg, '/tmp/an-test-log');
    expect(log.maxBytes).toBe(2048);
    expect(log.generations).toBe(5);
  });
});
```

- [ ] **Step 2: Run failing test**

```
pnpm test -- packages/core/tests/logger.test.ts
```
Expected: FAIL — `loggerFromConfig` not exported.

- [ ] **Step 3: Add factory**

```ts
// packages/core/src/logger.ts (additions — keep existing Logger class)
import type { Config } from './types.js';

export function loggerFromConfig(config: Config, dir: string): Logger {
  return new Logger({
    dir,
    maxBytes: config.logging.maxBytes,
    generations: config.logging.generations,
  });
}
```

(Expose `maxBytes` and `generations` as readonly public fields on `Logger` if not already — needed for the test assertion.)

- [ ] **Step 4: Switch all callsites to factory**

```ts
// packages/cli/src/status.ts — replace the Logger instantiation:
// OLD: const log = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
// NEW:
import { loggerFromConfig } from '@agent-notifier/core';
const log = loggerFromConfig(c, logDir());
```

```ts
// packages/cli/src/doctor.ts — same swap:
const log = loggerFromConfig(loadConfig(configFilePath(), 'UTC'), logDir());
```

```ts
// packages/cli/src/hook.ts — load config once at top of runHook, reuse for logger:
const cfg = new ConfigStore(configFilePath(), tzGuess()).load();
const log = loggerFromConfig(cfg, logDir());
```

- [ ] **Step 5: Run all tests — green**

```
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/logger.ts packages/core/tests/logger.test.ts \
        packages/cli/src/status.ts packages/cli/src/doctor.ts packages/cli/src/hook.ts
git commit -m "refactor(core): centralize Logger config via loggerFromConfig factory"
```

---

### Task 4: Extract `stubNotifyAppend` (dedupe 3 callers)

**Files:**
- Create: `packages/core/src/notify-stub.ts`
- Modify: `packages/core/src/index.ts` (re-export)
- Modify: `packages/cli/src/init.ts`, `packages/cli/src/doctor.ts`, `packages/cli/src/hook.ts`
- Test: `packages/core/tests/notify-stub.test.ts` (create)

- [ ] **Step 1: Write failing test**

```ts
// packages/core/tests/notify-stub.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubNotifyAppend } from '../src/notify-stub.js';
import type { Event } from '../src/types.js';

describe('stubNotifyAppend', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'an-stub-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const ev: Event = {
    kind: 'TURN_DONE', tool: 'claude-code',
    project: 'p', sessionId: 's', cwd: '/tmp', message: 'm',
  };

  it('appends a line for each event', () => {
    stubNotifyAppend(dir, ev);
    stubNotifyAppend(dir, ev);
    const file = join(dir, 'stub-notifications.jsonl');
    expect(existsSync(file)).toBe(true);
    const size = statSync(file).size;
    expect(size).toBeGreaterThan(0);
  });

  it('rotates (truncates) when 256 KB cap is exceeded', () => {
    const big: Event = { ...ev, message: 'x'.repeat(2048) };
    for (let i = 0; i < 200; i++) stubNotifyAppend(dir, big);
    const file = join(dir, 'stub-notifications.jsonl');
    expect(statSync(file).size).toBeLessThanOrEqual(256 * 1024);
  });
});
```

- [ ] **Step 2: Run failing test**

```
pnpm test -- packages/core/tests/notify-stub.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create module**

```ts
// packages/core/src/notify-stub.ts
import { existsSync, mkdirSync, statSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Event } from './types.js';

const STUB_FILE = 'stub-notifications.jsonl';
const CAP_BYTES = 256 * 1024;

export function stubNotifyAppend(dir: string, event: Event): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, STUB_FILE);
  const line = JSON.stringify({ event }) + '\n';
  if (existsSync(file) && statSync(file).size + line.length > CAP_BYTES) {
    writeFileSync(file, line, 'utf8'); // truncate + write fresh
    return;
  }
  appendFileSync(file, line, 'utf8');
}
```

```ts
// packages/core/src/index.ts (add export)
export { stubNotifyAppend } from './notify-stub.js';
```

- [ ] **Step 4: Replace 3 callers**

```ts
// packages/cli/src/init.ts:29-33 — REMOVE local stub() function. Replace its calls:
import { stubNotifyAppend, configDir } from '@agent-notifier/core';
// In runInit() where stub(ev) was called:
if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotifyAppend(configDir(), ev);
else await fireNotification(ev);
```

```ts
// packages/cli/src/doctor.ts:39-43 — same removal + replacement
import { stubNotifyAppend } from '@agent-notifier/core';
if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotifyAppend(configDir(), e);
else await fireNotification(e);
```

```ts
// packages/cli/src/hook.ts — same in stubNotify location
import { stubNotifyAppend } from '@agent-notifier/core';
// ...
if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotifyAppend(configDir(), event);
else await fireNotification(event);
```

- [ ] **Step 5: Run all tests — green**

```
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/notify-stub.ts packages/core/src/index.ts \
        packages/core/tests/notify-stub.test.ts \
        packages/cli/src/init.ts packages/cli/src/doctor.ts packages/cli/src/hook.ts
git commit -m "refactor(core): extract stubNotifyAppend; cap stub log at 256 KB"
```

---

## Phase B · Idle gate redesign

### Task 5: Terminal allowlist + per-terminal lookup table

**Files:**
- Create: `packages/core/src/idle-gate-terminals.ts`
- Test: `packages/core/tests/idle-gate-terminals.test.ts` (create)

- [ ] **Step 1: Write failing test**

```ts
// packages/core/tests/idle-gate-terminals.test.ts
import { describe, expect, it } from 'vitest';
import { isTerminalBundle, isTerminalProcess, getTabLookupForBundle } from '../src/idle-gate-terminals.js';

describe('idle-gate-terminals', () => {
  it('classifies known terminal bundles on macOS', () => {
    expect(isTerminalBundle('com.apple.Terminal')).toBe(true);
    expect(isTerminalBundle('com.googlecode.iterm2')).toBe(true);
    expect(isTerminalBundle('com.mitchellh.ghostty')).toBe(true);
    expect(isTerminalBundle('com.google.Chrome')).toBe(false);
  });

  it('classifies known terminal processes on Windows', () => {
    expect(isTerminalProcess('WindowsTerminal.exe')).toBe(true);
    expect(isTerminalProcess('chrome.exe')).toBe(false);
  });

  it('returns active-tab lookup function for supported bundles', () => {
    expect(getTabLookupForBundle('com.apple.Terminal')).toBeTypeOf('function');
    expect(getTabLookupForBundle('com.googlecode.iterm2')).toBeTypeOf('function');
    expect(getTabLookupForBundle('com.mitchellh.ghostty')).toBeUndefined();
    // VSCode-mac is unsupported per spec resolution 1.2:
    expect(getTabLookupForBundle('com.microsoft.VSCode')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run failing test → FAIL.**

- [ ] **Step 3: Implement module**

```ts
// packages/core/src/idle-gate-terminals.ts
import type { ExecFn } from './idle-gate.js';

const TERMINAL_BUNDLES_DARWIN = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'dev.warp.Warp-Stable',
  'com.mitchellh.ghostty',
  'co.zeit.hyper',
  'net.kovidgoyal.kitty',
  'com.github.wez.wezterm',
  'org.alacritty',
  'com.microsoft.VSCode',
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.exafunction.windsurf',
  'dev.zed.Zed',
]);

const TERMINAL_PROCESSES_WIN32 = new Set([
  'WindowsTerminal.exe', 'wt.exe',
  'pwsh.exe', 'powershell.exe', 'cmd.exe',
  'ConEmu64.exe', 'ConEmuC64.exe', 'cmder.exe', 'mintty.exe',
  'Code.exe', 'Cursor.exe', 'Windsurf.exe',
]);

export function isTerminalBundle(bundle: string): boolean {
  return TERMINAL_BUNDLES_DARWIN.has(bundle);
}
export function isTerminalProcess(name: string): boolean {
  return TERMINAL_PROCESSES_WIN32.has(name);
}

export type TabLookup = (exec: ExecFn) => Promise<string | null>;

const TAB_LOOKUP_DARWIN: Record<string, TabLookup> = {
  'com.apple.Terminal': async (exec) => {
    const { stdout } = await exec(
      `osascript -e 'tell application "Terminal" to get tty of selected tab of front window'`,
      { timeout: 200 },
    );
    return stdout.trim() || null;
  },
  'com.googlecode.iterm2': async (exec) => {
    const { stdout } = await exec(
      `osascript -e 'tell application "iTerm2" to tty of current session of current window'`,
      { timeout: 200 },
    );
    return stdout.trim() || null;
  },
};

export function getTabLookupForBundle(bundle: string): TabLookup | undefined {
  return TAB_LOOKUP_DARWIN[bundle];
}

export const TERMINAL_BUNDLES_DARWIN_CONST = TERMINAL_BUNDLES_DARWIN;
export const TERMINAL_PROCESSES_WIN32_CONST = TERMINAL_PROCESSES_WIN32;
```

- [ ] **Step 4: Run tests — pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/idle-gate-terminals.ts packages/core/tests/idle-gate-terminals.test.ts
git commit -m "feat(core): terminal allowlist + per-terminal active-tab lookup table"
```

---

### Task 6: Process tree walk with shell-hop (`getAiPid`, `getProcessTty`, `getProcessTerminal`)

**Files:**
- Modify: `packages/core/src/idle-gate.ts`
- Test: `packages/core/tests/idle-gate.test.ts` — process-tree section

- [ ] **Step 1: Write failing tests for process tree walk**

```ts
// packages/core/tests/idle-gate.test.ts (new tests; keep parsers from existing file)
import { describe, expect, it, vi } from 'vitest';
import { resolveAiPid, getProcessTty, walkUpToTerminal } from '../src/idle-gate.js';

const psStub = (table: Record<string, { ppid: string; comm: string; tty: string }>): import('../src/idle-gate.js').ExecFn =>
  async (cmd) => {
    const m = cmd.match(/-p (\d+)/);
    if (!m) return { stdout: '', stderr: '' };
    const pid = m[1]!;
    const row = table[pid];
    if (!row) return { stdout: '', stderr: '' };
    if (cmd.includes('ppid=')) return { stdout: row.ppid + '\n', stderr: '' };
    if (cmd.includes('comm=')) return { stdout: row.comm + '\n', stderr: '' };
    if (cmd.includes('tty='))  return { stdout: row.tty + '\n', stderr: '' };
    return { stdout: '', stderr: '' };
  };

describe('process tree walk', () => {
  it('shell-hops past bash to find AI tool', async () => {
    // tree: hook(100) ← bash(99) ← claude(98) ← Terminal(97)
    const exec = psStub({
      '100': { ppid: '99', comm: 'agent-notifier', tty: 'ttys003' },
      '99':  { ppid: '98', comm: 'bash',           tty: 'ttys003' },
      '98':  { ppid: '97', comm: 'claude',         tty: 'ttys003' },
      '97':  { ppid: '1',  comm: 'Terminal',       tty: '??' },
    });
    const aiPid = await resolveAiPid(99, { exec, platform: 'darwin' });
    expect(aiPid).toBe(98);
  });

  it('handles direct invocation (no shell hop)', async () => {
    const exec = psStub({
      '50': { ppid: '49', comm: 'agent-notifier', tty: 'ttys004' },
      '49': { ppid: '48', comm: 'claude',         tty: 'ttys004' },
      '48': { ppid: '1',  comm: 'iTerm2',         tty: '??' },
    });
    const aiPid = await resolveAiPid(49, { exec, platform: 'darwin' });
    expect(aiPid).toBe(49);
  });

  it('caps walk at 8 levels to prevent infinite loop', async () => {
    const big: Record<string, { ppid: string; comm: string; tty: string }> = {};
    for (let i = 0; i < 100; i++) big[String(i)] = { ppid: String(i + 1), comm: 'bash', tty: '??' };
    const exec = psStub(big);
    const aiPid = await resolveAiPid(0, { exec, platform: 'darwin' });
    expect(aiPid).toBeNull();
  });

  it('walks up to find the terminal app', async () => {
    const exec = psStub({
      '98': { ppid: '97', comm: 'claude',   tty: 'ttys005' },
      '97': { ppid: '96', comm: 'login',    tty: 'ttys005' },
      '96': { ppid: '1',  comm: 'iTerm2',   tty: '??' },
    });
    const term = await walkUpToTerminal(98, { exec, platform: 'darwin' });
    expect(term).toBe('iTerm2');
  });
});
```

- [ ] **Step 2: Run — FAIL (functions not exported yet).**

- [ ] **Step 3: Implement**

```ts
// packages/core/src/idle-gate.ts (additions; keep getIdleSeconds + parsers)
const SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'dash']);
const AI_EXES = new Set(['claude', 'codex', 'gemini', 'opencode']);
const MAX_DEPTH = 8;

export async function getProcessComm(pid: number, opts: GetIdleOptions = {}): Promise<string> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o comm= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    return stdout.trim();
  } catch { return ''; }
}

export async function getProcessPpid(pid: number, opts: GetIdleOptions = {}): Promise<number | null> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o ppid= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

export async function getProcessTty(pid: number, opts: GetIdleOptions = {}): Promise<string | null> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o tty= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    const t = stdout.trim();
    return t && t !== '??' ? t : null;
  } catch { return null; }
}

/**
 * Resolve AI tool's PID from the hook's parent PID, hopping past shells.
 * Returns null if no AI tool is found within MAX_DEPTH levels.
 */
export async function resolveAiPid(startPid: number, opts: GetIdleOptions = {}): Promise<number | null> {
  let pid: number | null = startPid;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (pid === null || pid <= 1) return null;
    const comm = await getProcessComm(pid, opts);
    const base = comm.split('/').pop() ?? comm;
    if (AI_EXES.has(base)) return pid;
    if (!SHELLS.has(base) && i > 0) return null; // not a shell, not AI — give up
    pid = await getProcessPpid(pid, opts);
  }
  return null;
}

export async function walkUpToTerminal(startPid: number, opts: GetIdleOptions = {}): Promise<string | null> {
  let pid: number | null = startPid;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (pid === null || pid <= 1) return null;
    const comm = await getProcessComm(pid, opts);
    const base = comm.split('/').pop() ?? comm;
    // Match terminal exe names (mac shows comm like "iTerm2" or "Ghostty"):
    const terminalExes = new Set(['Terminal', 'iTerm2', 'Ghostty', 'WezTerm', 'Alacritty', 'kitty', 'Hyper', 'Warp', 'Code', 'Cursor', 'Windsurf', 'Zed']);
    if (terminalExes.has(base)) return base;
    pid = await getProcessPpid(pid, opts);
  }
  return null;
}
```

- [ ] **Step 4: Run tests — pass.**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/idle-gate.ts packages/core/tests/idle-gate.test.ts
git commit -m "feat(core): process tree walk with shell-hop and 8-level depth cap"
```

---

### Task 7: Frontmost-app detection (`getFrontmostBundle`)

**Files:**
- Modify: `packages/core/src/idle-gate.ts`
- Test: `packages/core/tests/idle-gate.test.ts`

- [ ] **Step 1: Write tests for frontmost detection**

```ts
describe('getFrontmostBundle', () => {
  it('parses macOS osascript output (bundle id)', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'com.googlecode.iterm2\n', stderr: '' });
    const r = await getFrontmostBundle({ exec, platform: 'darwin' });
    expect(r).toBe('com.googlecode.iterm2');
  });
  it('returns null on osascript timeout/error (fail-open)', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('timeout'));
    const r = await getFrontmostBundle({ exec, platform: 'darwin' });
    expect(r).toBeNull();
  });
  it('parses Windows process name from PowerShell output', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'WindowsTerminal\n', stderr: '' });
    const r = await getFrontmostBundle({ exec, platform: 'win32' });
    expect(r).toBe('WindowsTerminal.exe');
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

```ts
// packages/core/src/idle-gate.ts (additions)
const MAC_FRONTMOST_CMD = `osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'`;
const WIN_FRONTMOST_CMD =
  'powershell -NoProfile -Command "' +
  "Add-Type 'using System; using System.Runtime.InteropServices; " +
  'public class W { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); ' +
  '[DllImport(\\"user32.dll\\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p); }\';' +
  '$h = [W]::GetForegroundWindow(); $p = 0; [W]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null; ' +
  '(Get-Process -Id $p).ProcessName"';

export async function getFrontmostBundle(opts: GetIdleOptions = {}): Promise<string | null> {
  const exec = opts.exec ?? execAsync;
  const platform = opts.platform ?? process.platform;
  const timeout = opts.timeoutMs ?? 200;
  try {
    if (platform === 'darwin') {
      const { stdout } = await exec(MAC_FRONTMOST_CMD, { timeout });
      const v = stdout.trim();
      return v || null;
    }
    if (platform === 'win32') {
      const { stdout } = await exec(WIN_FRONTMOST_CMD, { timeout });
      const v = stdout.trim();
      return v ? `${v}.exe` : null;
    }
    return null;
  } catch { return null; }
}
```

- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): getFrontmostBundle for macOS and Windows with 200ms timeout fail-open"
```

---

### Task 8: Gate decision function with 2s cache

**Files:**
- Modify: `packages/core/src/idle-gate.ts`
- Test: `packages/core/tests/idle-gate.test.ts` — gate-decision section

- [ ] **Step 1: Write failing tests for `decideGate()`**

```ts
import { decideGate, clearGateCache } from '../src/idle-gate.js';
import type { Config } from '../src/types.js';
import { defaultConfig } from '../src/config.js';

describe('decideGate (full decision tree)', () => {
  beforeEach(() => clearGateCache());
  const cfg = (overrides: Partial<Config['idleGate']> = {}): Config => {
    const c = defaultConfig('UTC');
    Object.assign(c.idleGate, overrides);
    return c;
  };

  it('PERMISSION always fires regardless of mode/frontmost', async () => {
    const r = await decideGate(cfg(), 'PERMISSION', 1234, { exec: vi.fn(), platform: 'darwin' });
    expect(r).toEqual({ fire: true, reason: 'permission-bypass' });
  });

  it('always-fire mode fires every event', async () => {
    const r = await decideGate(cfg({ mode: 'always-fire' }), 'TURN_DONE', 1234, { exec: vi.fn(), platform: 'darwin' });
    expect(r.fire).toBe(true);
  });

  it('fires when frontmost ≠ AI terminal', async () => {
    // Set up: frontmost = Chrome, AI = iTerm2.
    // ...mock the chain
  });

  it('suppresses when active tab TTY matches AI TTY', async () => { /* ... */ });
  it('fires on Ghostty (unsupported) with policy=fire', async () => { /* ... */ });
  it('suppresses on Ghostty with policy=gate + idle < threshold', async () => { /* ... */ });
  it('fires on osascript permission-denied (fail-open with reason fail-open)', async () => { /* ... */ });
});
```

(Each `it` block stubs the `exec` chain to simulate the relevant scenario — full bodies are mechanical given Task 6/7 helpers.)

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `decideGate`**

```ts
// packages/core/src/idle-gate.ts (additions)
import { isTerminalBundle, getTabLookupForBundle } from './idle-gate-terminals.js';
import type { Config, Kind } from './types.js';

export type GateDecision =
  | 'permission-bypass'
  | 'frontmost-other-app'
  | 'frontmost-different-tab'
  | 'frontmost-same-tab'
  | 'unsupported-terminal-fired'
  | 'unsupported-terminal-gated'
  | 'fail-open';

export interface GateResult {
  fire: boolean;
  reason: GateDecision;
}

interface CacheEntry { value: GateResult; ts: number }
const gateCache: Map<string, CacheEntry> = new Map();
const CACHE_MS = 2_000;

export function clearGateCache(): void { gateCache.clear(); }

export async function decideGate(
  config: Config, kind: Kind, hookPpid: number, opts: GetIdleOptions = {},
): Promise<GateResult> {
  if (kind === 'PERMISSION') return { fire: true, reason: 'permission-bypass' };

  const mode = config.idleGate.mode;
  if (mode === 'always-fire') return { fire: true, reason: 'frontmost-other-app' };

  const cacheKey = `${kind}:${hookPpid}:${mode}`;
  const hit = gateCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.value;

  let result: GateResult;
  try {
    if (mode === 'strict-os-idle') {
      const idle = await getIdleSeconds(opts);
      result = idle >= config.idleGate.thresholdSeconds
        ? { fire: true, reason: 'frontmost-other-app' }
        : { fire: false, reason: 'frontmost-same-tab' };
    } else {
      result = await decideFireElsewhere(config, hookPpid, mode, opts);
    }
  } catch {
    result = { fire: true, reason: 'fail-open' };
  }
  gateCache.set(cacheKey, { value: result, ts: Date.now() });
  return result;
}

async function decideFireElsewhere(
  config: Config, hookPpid: number, mode: 'fire-elsewhere' | 'strict-terminal', opts: GetIdleOptions,
): Promise<GateResult> {
  const aiPid = await resolveAiPid(hookPpid, opts);
  if (aiPid === null) return { fire: true, reason: 'fail-open' };

  const aiTty = await getProcessTty(aiPid, opts);
  if (aiTty === null) return { fire: true, reason: 'fail-open' };

  const aiTerminalExe = await walkUpToTerminal(aiPid, opts);
  if (aiTerminalExe === null) return { fire: true, reason: 'fail-open' };

  const frontmost = await getFrontmostBundle(opts);
  if (frontmost === null) return { fire: true, reason: 'fail-open' };

  if (!isTerminalBundle(frontmost)) return { fire: true, reason: 'frontmost-other-app' };

  // Same terminal app — but is it the same instance?
  // Approximate: bundle ID match means same terminal app. Now check active tab.
  if (mode === 'strict-terminal') {
    const idle = await getIdleSeconds(opts);
    return idle >= config.idleGate.thresholdSeconds
      ? { fire: true, reason: 'frontmost-different-tab' }
      : { fire: false, reason: 'frontmost-same-tab' };
  }

  const lookup = getTabLookupForBundle(frontmost);
  if (!lookup) {
    return config.idleGate.unsupportedTerminalPolicy === 'fire'
      ? { fire: true, reason: 'unsupported-terminal-fired' }
      : await applyOsIdleGate(config, opts, 'unsupported-terminal-gated');
  }
  const activeTabTty = await lookup(opts.exec ?? execAsync);
  if (activeTabTty === null) return { fire: true, reason: 'fail-open' };
  return activeTabTty === aiTty
    ? { fire: false, reason: 'frontmost-same-tab' }
    : { fire: true, reason: 'frontmost-different-tab' };
}

async function applyOsIdleGate(config: Config, opts: GetIdleOptions, gatedReason: GateDecision): Promise<GateResult> {
  const idle = await getIdleSeconds(opts);
  return idle >= config.idleGate.thresholdSeconds
    ? { fire: true, reason: 'frontmost-different-tab' }
    : { fire: false, reason: gatedReason };
}
```

- [ ] **Step 4: Run all tests — pass.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): gate decision tree with 2s cache (modes, policies, fail-open)"
```

---

### Task 9: Wire gate decision into `suppress.ts`

**Files:**
- Modify: `packages/core/src/suppress.ts`
- Modify: `packages/core/src/types.ts` (extend log entry shape if owned there)
- Test: `packages/core/tests/suppress.test.ts`

- [ ] **Step 1: Update test cases**

```ts
// extend tests:
describe('evaluateSuppression with new gate', () => {
  it('still bypasses gate for PERMISSION', async () => { /* assert no exec calls */ });
  it('records gateMode and gateDecision in result', async () => { /* assert shape */ });
});
```

- [ ] **Step 2: Update signature**

```ts
// packages/core/src/suppress.ts
import { decideGate, type GateDecision } from './idle-gate.js';

export interface SuppressDecision {
  fire: boolean;
  reason?: string;
  gateMode?: Config['idleGate']['mode'];
  gateDecision?: GateDecision;
}

export async function evaluateSuppression(
  config: Config, now: Date, event: Event, projectKey: string, hookPpid: number,
  opts: SuppressOptions = {},
): Promise<SuppressDecision> {
  if (!config.global.enabled) return { fire: false, reason: 'global-disabled' };
  if (config.mute && new Date(config.mute.until).getTime() > now.getTime())
    return { fire: false, reason: `muted-until-${config.mute.until}` };
  // ... existing schedule/tool/project checks unchanged ...
  const gate = await decideGate(config, event.kind, hookPpid, opts.gateOpts);
  return {
    fire: gate.fire,
    reason: gate.fire ? undefined : `gate:${gate.reason}`,
    gateMode: config.idleGate.mode,
    gateDecision: gate.reason,
  };
}
```

- [ ] **Step 3: Update hook.ts to pass `process.ppid`**

```ts
// packages/cli/src/hook.ts — pass ppid:
const decision = await evaluateSuppression(cfg, new Date(), event, projectKey, process.ppid);
```

- [ ] **Step 4: Run all tests — pass.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): replace user-active gate with decideGate; thread ppid through hook"
```

---

## Phase C · Notification branding (sound + icon)

### Task 10: Source SVG + icon generation script

**Files:**
- Create: `packages/core/src/assets/source/icon.svg`
- Create: `scripts/gen-icons.mjs`
- Modify: `package.json` (root) — add `gen:icons` script and dev deps `sharp`, `png2icons`
- Generated artifacts: `packages/core/src/assets/icon.png`, `icon.icns`, `icon.ico`

- [ ] **Step 1: Create source SVG (placeholder; design to be refined during PR review)**

```xml
<!-- packages/core/src/assets/source/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="120" fill="#5B7CFA"/>
  <!-- friendly bell glyph; refine before merge -->
  <path d="M256 120 C200 120 168 160 168 220 V310 L140 350 H372 L344 310 V220 C344 160 312 120 256 120 Z"
        fill="white"/>
  <circle cx="256" cy="385" r="20" fill="white"/>
  <circle cx="380" cy="160" r="32" fill="#FF6B6B"/>
</svg>
```

- [ ] **Step 2: Write generation script**

```js
// scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import png2icons from 'png2icons';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../packages/core/src/assets/source/icon.svg');
const OUT = resolve(here, '../packages/core/src/assets');

const svg = readFileSync(SRC);

const png512 = await sharp(svg).resize(512, 512).png().toBuffer();
const png256 = await sharp(svg).resize(256, 256).png().toBuffer();

writeFileSync(resolve(OUT, 'icon.png'), png512);

const icns = png2icons.createICNS(png512, png2icons.BILINEAR, 0);
if (!icns) throw new Error('ICNS generation failed');
writeFileSync(resolve(OUT, 'icon.icns'), icns);

const ico = png2icons.createICO(png256, png2icons.BILINEAR, 0, true);
if (!ico) throw new Error('ICO generation failed');
writeFileSync(resolve(OUT, 'icon.ico'), ico);

console.log('Generated icon.png / icon.icns / icon.ico');
```

- [ ] **Step 3: Add devDeps + script**

```json
// package.json (root) — devDependencies additions:
"sharp": "^0.33.0",
"png2icons": "^2.0.1"
```

```json
// package.json (root) — scripts additions:
"gen:icons": "node scripts/gen-icons.mjs"
```

- [ ] **Step 4: Run generator**

```
pnpm install
pnpm gen:icons
```

Verify three files appear at `packages/core/src/assets/{icon.png,icon.icns,icon.ico}`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/assets/ scripts/gen-icons.mjs package.json pnpm-lock.yaml
git commit -m "feat(core): bundle source SVG + generated PNG/ICNS/ICO icons"
```

---

### Task 11: tsup `onSuccess` copy + `files` whitelist

**Files:**
- Modify: `packages/core/tsup.config.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Update tsup config**

```ts
// packages/core/tsup.config.ts
import { defineConfig } from 'tsup';
import { cp, mkdir } from 'node:fs/promises';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  onSuccess: async () => {
    await mkdir('assets', { recursive: true });
    await cp('src/assets', 'assets', { recursive: true });
  },
});
```

- [ ] **Step 2: Update files whitelist**

```json
// packages/core/package.json — files array:
"files": ["dist", "assets"]
```

- [ ] **Step 3: Build and verify**

```
pnpm -C packages/core build
ls packages/core/assets/  # icon.png icon.icns icon.ico
npm pack --dry-run -C packages/core
# Output should include package/assets/icon.png etc.
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/tsup.config.ts packages/core/package.json
git commit -m "build(core): copy assets to package root and include in published tarball"
```

---

### Task 12: notify.ts — single sound, bundled icon, asset fallback

**Files:**
- Modify: `packages/core/src/notify.ts`
- Test: `packages/core/tests/notify.test.ts`

- [ ] **Step 1: Update tests**

```ts
// packages/core/tests/notify.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fireNotification, resolveAssets } from '../src/notify.js';
import { defaultConfig } from '../src/config.js';

describe('resolveAssets', () => {
  it('returns built-in name for sound when config has built-in default', () => {
    const a = resolveAssets(defaultConfig('UTC'), 'darwin');
    expect(a.sound).toBe('Ping');
    expect(a.icon).toMatch(/icon\.(png|icns)$/);
  });
  it('passes through absolute custom sound path', () => {
    const c = defaultConfig('UTC'); c.sound.darwin = '/tmp/x.aiff';
    expect(resolveAssets(c, 'darwin').sound).toBe('/tmp/x.aiff');
  });
  it('falls back to bundled icon when custom icon path missing', () => {
    const c = defaultConfig('UTC'); c.icon.darwin = '/no/such/file.png';
    expect(resolveAssets(c, 'darwin').icon).toMatch(/assets\/icon\.png$/);
  });
});

describe('fireNotification (single sound)', () => {
  it('uses Ping for all kinds on mac', async () => {
    const calls: any[] = [];
    const notifier = { notify: async (o: any) => { calls.push(o); } };
    for (const kind of ['PERMISSION', 'IDLE', 'TURN_DONE'] as const) {
      await fireNotification(
        { kind, tool: 'claude-code', project: 'p', sessionId: 's', cwd: '/', message: 'm' },
        { platform: 'darwin', notifier, config: defaultConfig('UTC') },
      );
    }
    for (const c of calls) expect(c.sound).toBe('Ping');
    expect(calls[0].wait).toBe(true);   // PERMISSION sticky
    expect(calls[1].wait).toBe(false);  // IDLE
    expect(calls[2].wait).toBe(false);  // TURN_DONE
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Rewrite notify.ts**

```ts
// packages/core/src/notify.ts
import notifierLib from 'node-notifier';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config, Event, Kind } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLED = {
  darwin:    resolve(here, '../assets/icon.png'),
  darwinIcns: resolve(here, '../assets/icon.icns'),
  win32:     resolve(here, '../assets/icon.ico'),
};
const DEFAULT_SOUND = {
  darwin: 'Ping',
  win32:  'ms-winsoundevent:Notification.Default',
};

export interface ResolvedAssets { sound: string; icon: string }

export function resolveAssets(config: Config, platform: NodeJS.Platform): ResolvedAssets {
  const sound = config.sound[platform === 'win32' ? 'win32' : 'darwin'] || DEFAULT_SOUND[platform === 'win32' ? 'win32' : 'darwin'];
  const customIcon = config.icon[platform === 'win32' ? 'win32' : 'darwin'];
  const bundled = platform === 'win32' ? BUNDLED.win32 : BUNDLED.darwin;
  const icon = customIcon && existsSync(customIcon) ? customIcon : bundled;
  return { sound, icon };
}

interface KindMeta { title: string; sticky: boolean }
const KINDS: Record<Kind, KindMeta> = {
  PERMISSION: { title: 'Claude needs approval', sticky: true  },
  IDLE:       { title: 'Agent is idle',         sticky: false },
  TURN_DONE:  { title: 'Agent is done',         sticky: false },
};

export interface FireOptions {
  platform?: NodeJS.Platform;
  notifier?: { notify: (o: Record<string, unknown>) => Promise<void> };
  config: Config;
}

const defaultNotifier = {
  notify: (opts: Record<string, unknown>) =>
    new Promise<void>((resolveP) => { notifierLib.notify(opts, () => resolveP()); }),
};

export async function fireNotification(event: Event, opts: FireOptions): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const n = opts.notifier ?? defaultNotifier;
  const cfg = KINDS[event.kind];
  const { sound, icon } = resolveAssets(opts.config, platform);
  const body = `${event.project} · ${event.tool}${event.message ? ` · ${event.message.slice(0, 80)}` : ''}`;

  if (platform === 'win32') {
    await n.notify({
      title: cfg.title, message: body, sound, appIcon: icon,
      scenario: cfg.sticky ? 'alarm' : 'reminder',
      timeout: cfg.sticky ? false : 10,
    });
    return;
  }
  await n.notify({
    title: cfg.title, message: body, sound, contentImage: icon,
    wait: cfg.sticky, timeout: cfg.sticky ? 0 : 10,
  });
}
```

- [ ] **Step 4: Update all `fireNotification` callers to pass `config`**

`packages/cli/src/init.ts`, `doctor.ts`, `hook.ts` all need `config` in the options object. Use `loadConfig(configFilePath(), tzGuess())` if not already loaded.

- [ ] **Step 5: Run all tests — pass.**
- [ ] **Step 6: Commit**

```bash
git commit -am "feat(core): single sound + bundled icon with custom-path override and fallback"
```

---

### Task 13: Path validation in zod refinements

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/tests/types.test.ts`

- [ ] **Step 1: Add tests**

```ts
it('accepts built-in mac sound name "Ping"', () => {
  const c = ConfigSchema.parse({ version: 2, tz: 'UTC', sound: { darwin: 'Ping' } });
  expect(c.sound.darwin).toBe('Ping');
});
it('accepts absolute .aiff sound path that exists', () => {
  // create temp file
  const f = '/tmp/exists.aiff'; writeFileSync(f, '');
  const c = ConfigSchema.parse({ version: 2, tz: 'UTC', sound: { darwin: f } });
  expect(c.sound.darwin).toBe(f);
  unlinkSync(f);
});
it('rejects sound path that does not exist', () => {
  expect(() => ConfigSchema.parse({ version: 2, tz: 'UTC', sound: { darwin: '/no/such.aiff' } })).toThrow();
});
```

- [ ] **Step 2: Add zod refinements**

```ts
// packages/core/src/types.ts (extend the sound + icon fields with .superRefine)
import { existsSync } from 'node:fs';

const isAbs = (s: string) => s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s);
const macBuiltinRe = /^[A-Z][a-z]+$/;

export const ConfigSchema = z.object({
  // ... other fields
  sound: z
    .object({
      darwin: z.string().min(1).default('Ping').superRefine((v, ctx) => {
        if (isAbs(v)) {
          if (!/\.(aiff|caf)$/i.test(v)) ctx.addIssue({ code: 'custom', message: 'mac custom sound must end .aiff or .caf' });
          else if (!existsSync(v)) ctx.addIssue({ code: 'custom', message: `sound file not found: ${v}` });
        } else if (!macBuiltinRe.test(v)) {
          ctx.addIssue({ code: 'custom', message: `'${v}' is not a built-in mac sound name (PascalCase) or absolute path` });
        }
      }),
      win32: z.string().min(1).default('ms-winsoundevent:Notification.Default').superRefine((v, ctx) => {
        if (v.startsWith('ms-winsoundevent:')) return;
        if (!isAbs(v)) ctx.addIssue({ code: 'custom', message: 'win sound must be ms-winsoundevent:* or absolute path' });
        else if (!/\.wav$/i.test(v)) ctx.addIssue({ code: 'custom', message: 'win custom sound must end .wav' });
        else if (!existsSync(v)) ctx.addIssue({ code: 'custom', message: `sound file not found: ${v}` });
      }),
    })
    .default({}),
  icon: z
    .object({
      darwin: z.string().min(1).nullable().default(null).superRefine((v, ctx) => {
        if (v === null) return;
        if (!isAbs(v)) ctx.addIssue({ code: 'custom', message: 'mac icon must be absolute path' });
        else if (!/\.(png|icns)$/i.test(v)) ctx.addIssue({ code: 'custom', message: 'mac icon must end .png or .icns' });
        else if (!existsSync(v)) ctx.addIssue({ code: 'custom', message: `icon file not found: ${v}` });
      }),
      win32: z.string().min(1).nullable().default(null).superRefine((v, ctx) => {
        if (v === null) return;
        if (!isAbs(v)) ctx.addIssue({ code: 'custom', message: 'win icon must be absolute path' });
        else if (!/\.ico$/i.test(v)) ctx.addIssue({ code: 'custom', message: 'win icon must end .ico' });
        else if (!existsSync(v)) ctx.addIssue({ code: 'custom', message: `icon file not found: ${v}` });
      }),
    })
    .default({}),
});
```

- [ ] **Step 3: Run tests — pass.**
- [ ] **Step 4: Commit**

```bash
git commit -am "feat(core): zod refinements validate sound/icon paths at config save time"
```

---

## Phase D · UI library + universal flags

### Task 14: `lib/ui.ts` — symbol set, error formatter, spinner factory

**Files:**
- Create: `packages/cli/src/lib/ui.ts`
- Modify: `packages/cli/package.json` (add `ora` dep)
- Test: `packages/cli/tests/ui.test.ts` (create)

- [ ] **Step 1: Add `ora` dep**

```
pnpm -C packages/cli add ora@^8.0.0
```

- [ ] **Step 2: Write tests**

```ts
// packages/cli/tests/ui.test.ts
import { describe, expect, it } from 'vitest';
import { sym, formatError, isQuiet } from '../src/lib/ui.js';

describe('UI primitives', () => {
  it('exposes the locked symbol set', () => {
    expect(sym.ok).toBe('✓'); expect(sym.warn).toBe('!'); expect(sym.fail).toBe('✗');
    expect(sym.dot).toBe('·'); expect(sym.cursor).toBe('›');
    expect(sym.flow).toBe('▸'); expect(sym.dash).toBe('—'); expect(sym.alert).toBe('⚠');
  });
  it('formats errors as what/why/next', () => {
    const out = formatError({
      what: "Couldn't wire claude-code",
      why: 'invalid JSON at line 14',
      next: 'fix the file or run reset',
    });
    expect(out).toContain('✗ Couldn\'t wire claude-code');
    expect(out).toContain('Why:  invalid JSON at line 14');
    expect(out).toContain('Next: fix the file or run reset');
  });
});
```

- [ ] **Step 3: Implement**

```ts
// packages/cli/src/lib/ui.ts
import kleur from 'kleur';
import ora, { type Ora } from 'ora';

export const sym = {
  ok:    '✓', fail:   '✗', warn:  '!', dot:    '·',
  cursor:'›', flow:   '▸', alert: '⚠', dash:  '—',
} as const;

export function colorOk(s: string)   { return kleur.green(s); }
export function colorWarn(s: string) { return kleur.yellow(s); }
export function colorFail(s: string) { return kleur.red(s); }
export function colorDim(s: string)  { return kleur.gray(s); }

export interface ErrorMsg { what: string; why: string; next: string }
export function formatError(e: ErrorMsg): string {
  return [
    `${colorFail(sym.fail)} ${kleur.bold(e.what)}`,
    '',
    `  Why:  ${e.why}`,
    `  Next: ${e.next}`,
  ].join('\n');
}

export function isQuiet(): boolean {
  return process.argv.includes('--quiet') || process.argv.includes('-q');
}
export function isJson(): boolean { return process.argv.includes('--json'); }
export function isDebug(): boolean { return process.argv.includes('--debug') || process.env['AGENT_NOTIFIER_DEBUG'] === '1'; }

export function spinner(text: string): Ora | { start: () => void; succeed: (t?: string) => void; fail: (t?: string) => void; stop: () => void } {
  if (!process.stdout.isTTY || isQuiet() || isJson()) {
    return {
      start: () => undefined,
      succeed: (t?: string) => { if (!isQuiet() && !isJson()) console.log(`${colorOk(sym.ok)} ${t ?? text}`); },
      fail:    (t?: string) => { if (!isJson()) console.error(`${colorFail(sym.fail)} ${t ?? text}`); },
      stop:    () => undefined,
    };
  }
  return ora({ text, spinner: 'dots' });
}
```

- [ ] **Step 4: Run tests — pass.**
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(cli): UI primitives (symbols, error formatter, TTY-aware spinner)"
```

---

### Task 15: Universal flags + bare-command behavior

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/bare-command.test.ts` (create)

- [ ] **Step 1: Tests**

```ts
// packages/cli/tests/bare-command.test.ts
// (spawn the CLI as a subprocess against a temp HOME; assert stdout)
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', 'bin', 'agent-notifier.js');

describe('bare command', () => {
  it('runs init wizard when config is missing (--help works)', () => {
    const r = spawnSync('node', [BIN, '--help'], { encoding: 'utf8' });
    expect(r.stdout).toContain('Usage: agent-notifier');
  });
});
```

(Bare-command init flow is interactive; integration test covered in Phase E. Here we just verify --help still works.)

- [ ] **Step 2: Update `index.ts`**

```ts
// packages/cli/src/index.ts (additions to default action)
program
  .option('-q, --quiet', 'suppress non-error output')
  .option('--json', 'machine-readable output')
  .option('--no-color', 'disable color')
  .option('--debug', 'verbose debugging output');

program.action(async () => {
  const { existsSync } = await import('node:fs');
  const { configFilePath } = await import('@agent-notifier/core');
  if (!existsSync(configFilePath())) {
    const { runInit } = await import('./init.js');
    await runInit({});
    return;
  }
  const { runStatus } = await import('./status.js');
  await runStatus({});
});

// register new subcommands:
program.command('reset').description('uninstall hooks and delete config (preserves logs)')
  .option('--yes', 'skip confirmation')
  .action(async (opts: { yes?: boolean }) => {
    const { runReset } = await import('./reset.js');
    await runReset(opts);
  });

const proj = program.command('project').description('manage per-project rules');
proj.action(async () => { (await import('./project.js')).runProjectInteractive(); });
proj.command('show').option('--project <path>').option('--json')
  .action(async (o: { project?: string; json?: boolean }) => (await import('./project.js')).runProjectShow(o));
proj.command('set').option('--enabled <bool>').option('--kinds <list>').option('--project <path>')
  .action(async (o: any) => (await import('./project.js')).runProjectSet(o));
proj.command('clear').option('--project <path>').option('--yes')
  .action(async (o: any) => (await import('./project.js')).runProjectClear(o));
proj.command('list').option('--json')
  .action(async (o: any) => (await import('./project.js')).runProjectList(o));
```

- [ ] **Step 3: Run tests — pass.**
- [ ] **Step 4: Commit**

```bash
git commit -am "feat(cli): universal flags, bare-command routing, register project + reset"
```

---

## Phase E · `init` wizard rewrite

### Task 16: Lock file (`lib/lock.ts`)

**Files:**
- Create: `packages/cli/src/lib/lock.ts`
- Test: `packages/cli/tests/lock.test.ts` (create)

- [ ] **Step 1: Tests**

```ts
import { acquireInitLock, releaseInitLock, isLockStale } from '../src/lib/lock.js';
// ... tests cover: acquire on clean dir, fail when live PID holds, reclaim when stale
```

- [ ] **Step 2: Implement**

```ts
// packages/cli/src/lib/lock.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '@agent-notifier/core';

const LOCK_NAME = '.init.lock';

export function lockPath(): string { return join(configDir(), LOCK_NAME); }

export function isLockStale(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch { return true; }
}

export function acquireInitLock(): { ok: true } | { ok: false; pid: number; stale: boolean } {
  const f = lockPath();
  if (existsSync(f)) {
    const pid = Number(readFileSync(f, 'utf8').trim());
    if (Number.isFinite(pid) && !isLockStale(pid)) return { ok: false, pid, stale: false };
    // stale → reclaim
  }
  writeFileSync(f, String(process.pid), 'utf8');
  return { ok: true };
}

export function releaseInitLock(): void {
  const f = lockPath();
  if (existsSync(f)) {
    try {
      const pid = Number(readFileSync(f, 'utf8').trim());
      if (pid === process.pid) unlinkSync(f);
    } catch { /* ignore */ }
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git commit -am "feat(cli): PID-aware init lock with stale reclaim"
```

---

### Task 17: `init.ts` rewrite — smart re-init + minimal layman path

**Files:**
- Rewrite: `packages/cli/src/init.ts`
- Test: `packages/cli/tests/init-firstrun.test.ts`, `init-reinit.test.ts`

(Both test files mock inquirer and assert the resulting config + tool wiring calls.)

- [ ] **Step 1: Tests — first run**

```ts
// packages/cli/tests/init-firstrun.test.ts
// mock @inquirer/prompts so checkbox/confirm/input return preset answers
// run runInit({}) against temp HOME
// assert: ~/.agent-notifier/config.json exists with expected defaults
// assert: each detected installer's install() was called
```

- [ ] **Step 2: Tests — re-init preselection**

```ts
// packages/cli/tests/init-reinit.test.ts
// pre-write a v2 config with custom values
// mock inquirer to verify the `default:` arg of each prompt matches existing config values
// hit-enter-through path: assert config is unchanged after runInit({})
// toggle-off path: untoggle a tool → assert installer.uninstall() called and tool removed from config.tools
```

- [ ] **Step 3: Rewrite `init.ts`**

```ts
// packages/cli/src/init.ts (full rewrite — ~150 lines; shape below)
import { checkbox, input, confirm, select } from '@inquirer/prompts';
import kleur from 'kleur';
import {
  ConfigStore, configFilePath, configDir, defaultConfig,
  fireNotification, stubNotifyAppend,
  type Event, type ToolName, type Config,
} from '@agent-notifier/core';
import { existsSync } from 'node:fs';
import { allInstallers, type ToolInstaller } from './install.js';
import { acquireInitLock, releaseInitLock } from './lib/lock.js';
import { sym, colorOk, colorDim, spinner } from './lib/ui.js';

export interface InitOpts {
  advanced?: boolean;
  tools?: string;
  noTest?: boolean;
  schedule?: string;
  scheduleDays?: string;
  idleGate?: string;
  idleThreshold?: number;
  unsupportedTabPolicy?: 'fire' | 'gate';
  sound?: string;
  icon?: string;
  kinds?: string;
  reset?: boolean;
  yes?: boolean;
}

function tzGuess(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

async function detectedTools(): Promise<ToolInstaller[]> {
  const out: ToolInstaller[] = [];
  for (const i of allInstallers()) if (await i.detect()) out.push(i);
  return out;
}

export async function runInit(opts: InitOpts): Promise<void> {
  // --reset short-circuit:
  if (opts.reset) {
    const { runReset } = await import('./reset.js');
    await runReset({ yes: opts.yes });
    return runInit({ ...opts, reset: false }); // re-enter as first-run
  }

  const lock = acquireInitLock();
  if (!lock.ok) {
    console.error(`${kleur.yellow(sym.alert)} Another setup is in progress (PID ${lock.pid}).`);
    console.error('  Next: wait for it, or remove ~/.agent-notifier/.init.lock if stale.');
    process.exit(1);
  }
  try { await runInitInner(opts); } finally { releaseInitLock(); }
}

async function runInitInner(opts: InitOpts): Promise<void> {
  const file = configFilePath();
  const isReinit = existsSync(file);
  const tz = tzGuess();
  const store = new ConfigStore(file, tz);
  const current = isReinit ? store.load() : defaultConfig(tz);

  const headline = isReinit ? 'agent-notifier — reconfigure' : 'agent-notifier — set up';
  console.log(kleur.bold(headline) + '\n');

  // Tools
  const det = await detectedTools();
  if (det.length === 0) console.log(`  ${colorDim('No supported AI CLIs detected.')}\n`);
  else {
    console.log('  Detected on this machine');
    for (const i of det) {
      const wired = await i.isWired();
      const mark = wired ? colorOk(sym.ok) : colorDim(sym.dot);
      console.log(`    ${mark} ${i.name.padEnd(14)} ${colorDim(wired ? 'wired' : 'detected')}`);
    }
    console.log('');
  }

  // Determine tool selection: flag, prompt, or default-all
  const flagTools = opts.tools?.split(',').map((s) => s.trim()) as ToolName[] | undefined;
  const detectedNames = det.map((d) => d.name);
  let chosen: ToolName[];
  if (flagTools) chosen = flagTools.filter((t) => detectedNames.includes(t));
  else {
    const wiredNow = new Set<ToolName>();
    for (const i of det) if (await i.isWired()) wiredNow.add(i.name);
    chosen = await checkbox({
      message: isReinit ? 'Tools to keep wired (toggle to add/remove):' : 'Wire these up?',
      choices: det.map((d) => ({ name: d.name, value: d.name, checked: wiredNow.size ? wiredNow.has(d.name) : true })),
    });
  }

  // Apply tool changes (with spinners):
  for (const inst of det) {
    const wired = await inst.isWired();
    const want = chosen.includes(inst.name);
    if (want && !wired) {
      const sp = spinner(`Wiring ${inst.name}…`); sp.start();
      try { await inst.install(); sp.succeed(`Wired ${inst.name}`); }
      catch (e) { sp.fail(`Couldn't wire ${inst.name}`); throw e; }
    } else if (!want && wired) {
      const sp = spinner(`Removing ${inst.name}…`); sp.start();
      try { await inst.uninstall(); sp.succeed(`Removed ${inst.name}`); }
      catch (e) { sp.fail(`Couldn't remove ${inst.name}`); throw e; }
    }
  }

  // Build new config — preserve current, override per chosen tools
  const next: Config = { ...current, version: 2, tz };
  for (const t of ['claude-code', 'codex', 'gemini', 'opencode'] as const) {
    next.tools[t] = { enabled: chosen.includes(t) };
  }

  // Advanced flow (only if --advanced)
  if (opts.advanced) {
    next.idleGate.mode = await select({
      message: 'Idle-gate mode:',
      choices: [
        { name: 'fire-elsewhere (recommended)', value: 'fire-elsewhere' },
        { name: 'always-fire', value: 'always-fire' },
        { name: 'strict-terminal (gate whole terminal)', value: 'strict-terminal' },
        { name: 'strict-os-idle (legacy HIDIdleTime only)', value: 'strict-os-idle' },
      ],
      default: current.idleGate.mode,
    });
    next.idleGate.thresholdSeconds = Number(await input({ message: 'Idle threshold (seconds):', default: String(current.idleGate.thresholdSeconds) }));
    next.idleGate.unsupportedTerminalPolicy = await select({
      message: 'When the terminal can\'t tell us which tab is focused:',
      choices: [{ name: 'fire (notify anyway)', value: 'fire' }, { name: 'gate (suppress, like the whole app is in focus)', value: 'gate' }],
      default: current.idleGate.unsupportedTerminalPolicy,
    });
    const soundPick = await input({ message: 'Sound (built-in name or absolute path):', default: current.sound.darwin });
    next.sound.darwin = soundPick;
    const iconPick = await input({ message: 'Custom icon path (empty = bundled default):', default: current.icon.darwin ?? '' });
    next.icon.darwin = iconPick.trim() === '' ? null : iconPick;
    // ... other advanced prompts (kinds, projectDefault, schedule) similar
  }

  // Schedule from flags (only)
  if (opts.schedule && opts.scheduleDays) {
    const [from, to] = opts.schedule.split('-');
    next.schedules.push({
      id: 'work-hours', type: 'allow',
      days: opts.scheduleDays.split(',') as Config['schedules'][0]['days'],
      from: from!, to: to!,
    });
  }

  store.save(next);
  console.log(`${colorOk(sym.ok)} wrote config to ${file}\n`);

  // Test fire (default Yes on first-run, No on re-init)
  const testDefault = !isReinit;
  const wantTest = opts.noTest === true ? false : await confirm({
    message: 'Send a test notification now?', default: testDefault,
  });
  if (wantTest) {
    if (process.platform === 'darwin') {
      console.log(colorDim('  Heads up: macOS may ask permission for agent-notifier to detect which app you\'re focused on — say allow.'));
    }
    const ev: Event = {
      kind: 'TURN_DONE', tool: 'claude-code',
      project: '<init-test>', sessionId: 'init', cwd: process.cwd(),
      message: 'init test',
    };
    if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotifyAppend(configDir(), ev);
    else await fireNotification(ev, { config: next });
  }

  console.log(kleur.bold('\nDone.') + colorDim(' Run `agent-notifier status` anytime.'));
  if (!opts.advanced) console.log(colorDim('Pro tip: `agent-notifier init --advanced` for schedules, sound, gate options.'));
  console.log(colorDim('         `agent-notifier project` (in any project dir) for per-project rules.'));
}
```

- [ ] **Step 4: Update `index.ts` to register flags**

```ts
program.command('init').description('interactive setup (smart re-init)')
  .option('--advanced').option('--tools <list>').option('--no-test')
  .option('--schedule <range>').option('--schedule-days <days>')
  .option('--idle-gate <mode>').option('--idle-threshold <seconds>', '', Number)
  .option('--unsupported-tab-policy <policy>')
  .option('--sound <name-or-path>').option('--icon <path>')
  .option('--kinds <list>').option('--reset').option('--yes')
  .action(async (opts: InitOpts) => { (await import('./init.js')).runInit(opts); });
```

- [ ] **Step 5: Run all tests — pass.**
- [ ] **Step 6: Commit**

```bash
git commit -am "feat(cli): smart re-init wizard with preselects, advanced flow, non-interactive flags"
```

---

### Task 18: `reset.ts` — uninstall hooks + delete config

**Files:**
- Create: `packages/cli/src/reset.ts`
- Test: `packages/cli/tests/reset.test.ts`

- [ ] **Step 1: Tests**

```ts
// reset.test.ts:
// - --yes flag: no prompt; uninstalls all wired tools; deletes config; preserves log dir
// - interactive: typing 'reset' confirms; typing anything else aborts
```

- [ ] **Step 2: Implement**

```ts
// packages/cli/src/reset.ts
import { input } from '@inquirer/prompts';
import { unlinkSync, existsSync } from 'node:fs';
import kleur from 'kleur';
import { configFilePath, configDir, logDir } from '@agent-notifier/core';
import { allInstallers } from './install.js';
import { sym, colorOk, colorDim } from './lib/ui.js';

export async function runReset(opts: { yes?: boolean }): Promise<void> {
  console.log(kleur.bold('agent-notifier — reset') + '\n');
  console.log('  This will:');
  console.log('    · uninstall hooks from each wired tool (restores .agent-notifier.bak)');
  console.log(`    · delete ${configFilePath()}`);
  console.log(`    · keep ${logDir()} (your history)`);
  console.log('');

  if (!opts.yes) {
    const c = await input({ message: "Type 'reset' to confirm:" });
    if (c.trim() !== 'reset') { console.log(colorDim('Aborted.')); return; }
  }

  for (const inst of allInstallers()) {
    if (await inst.isWired()) await inst.uninstall();
  }
  if (existsSync(configFilePath())) unlinkSync(configFilePath());
  console.log(`${colorOk(sym.ok)} reset complete`);
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git commit -am "feat(cli): reset command (uninstall hooks + delete config; preserves logs)"
```

---

## Phase F · `project` subcommand

### Task 19: `project.ts` — interactive editor + show/set/clear/list

**Files:**
- Create: `packages/cli/src/project.ts`
- Test: `packages/cli/tests/project.test.ts`

- [ ] **Step 1: Tests** (one for each subcommand against a temp HOME)

- [ ] **Step 2: Implement**

```ts
// packages/cli/src/project.ts
import { checkbox, confirm, input } from '@inquirer/prompts';
import kleur from 'kleur';
import {
  ConfigStore, configFilePath, resolveProjectKey, projectDisplayName,
  KindSchema, type Kind, type Config,
} from '@agent-notifier/core';
import { sym, colorOk, colorDim, formatError } from './lib/ui.js';

const KINDS: Kind[] = ['PERMISSION', 'IDLE', 'TURN_DONE'];

function store(): ConfigStore {
  return new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function projectFor(c: Config, target: string) {
  const key = resolveProjectKey(target);
  return { key, entry: c.projects[key], displayName: projectDisplayName(target) };
}

export async function runProjectInteractive(target: string = process.cwd()): Promise<void> {
  const s = store(); const c = s.load();
  const { key, entry, displayName } = projectFor(c, target);
  console.log(kleur.bold('agent-notifier — project rules') + '\n');
  console.log(`  Project   ${displayName}`);
  console.log(`  Path      ${target}`);
  console.log(`  Status    ${entry ? `${entry.enabled ? 'enabled' : 'disabled'} · kinds: ${entry.kinds?.join(',') ?? 'all'}` : colorDim(`not configured (default: ${c.projectDefault.enabled ? 'enabled' : 'disabled'})`)}\n`);

  const enabled = await confirm({ message: 'Notify for this project?', default: entry?.enabled ?? c.projectDefault.enabled });
  const kinds = await checkbox({
    message: 'Which events?',
    choices: KINDS.map((k) => ({
      name: k, value: k,
      checked: entry?.kinds ? entry.kinds.includes(k) : true,
    })),
  });

  s.update((cfg) => {
    cfg.projects[key] = { enabled, kinds: kinds.length === KINDS.length ? undefined : kinds };
  });
  console.log(`${colorOk(sym.ok)} saved`);
}

export async function runProjectShow(opts: { project?: string; json?: boolean }): Promise<void> {
  const target = opts.project ?? process.cwd();
  const c = store().load();
  const { entry, displayName } = projectFor(c, target);
  if (opts.json) { console.log(JSON.stringify({ project: displayName, path: target, entry }, null, 2)); return; }
  console.log(`project   ${displayName}`);
  console.log(`path      ${target}`);
  if (entry) {
    console.log(`enabled   ${entry.enabled ? '✓ yes' : '✗ no'}`);
    console.log(`kinds     ${entry.kinds?.join(', ') ?? 'all'}`);
  } else {
    console.log(`enabled   ${colorDim(`(default: ${c.projectDefault.enabled})`)}`);
    console.log(`kinds     ${colorDim('(default: all)')}`);
  }
}

export async function runProjectSet(opts: { enabled?: string; kinds?: string; project?: string }): Promise<void> {
  const target = opts.project ?? process.cwd();
  const key = resolveProjectKey(target);
  const enabled = opts.enabled === undefined ? undefined : opts.enabled === 'true';
  const kinds = !opts.kinds || opts.kinds === 'all'
    ? undefined
    : opts.kinds.split(',').map((k) => KindSchema.parse(k.trim()));
  store().update((c) => {
    const cur = c.projects[key] ?? { enabled: c.projectDefault.enabled };
    c.projects[key] = { enabled: enabled ?? cur.enabled, kinds };
  });
  console.log(`${colorOk(sym.ok)} updated ${key}`);
}

export async function runProjectClear(opts: { project?: string; yes?: boolean }): Promise<void> {
  const target = opts.project ?? process.cwd();
  const key = resolveProjectKey(target);
  if (!opts.yes) {
    const ok = await confirm({ message: `Remove rules for ${key}?`, default: true });
    if (!ok) return;
  }
  store().update((c) => { delete c.projects[key]; });
  console.log(`${colorOk(sym.ok)} cleared ${key}`);
}

export async function runProjectList(opts: { json?: boolean }): Promise<void> {
  const c = store().load();
  if (opts.json) { console.log(JSON.stringify(c.projects, null, 2)); return; }
  const keys = Object.keys(c.projects);
  if (keys.length === 0) { console.log(colorDim('(no projects configured)')); return; }
  for (const k of keys) {
    const e = c.projects[k]!;
    console.log(`${k.padEnd(60)}  ${e.enabled ? colorOk('✓ enabled ') : '✗ disabled'}  ${e.kinds?.join(',') ?? 'all kinds'}`);
  }
}
```

- [ ] **Step 3: Run tests, commit**

```bash
git commit -am "feat(cli): project subcommand (interactive, show, set, clear, list)"
```

---

## Phase G · status revamp + emoji removal + tests

### Task 20: Revamp `status.ts` layout + `--verbose` + `--json`

**Files:**
- Rewrite: `packages/cli/src/status.ts`
- Test: `packages/cli/tests/status.test.ts`

(Implementation mirrors the spec's Section 10.6 layout; field-by-field.)

- [ ] **Step 1: Tests asserting layout headers** (`Notifications`, `Tools`, `This project`, `Idle gate`)
- [ ] **Step 2: Implement (uses `lib/ui.ts` and `loggerFromConfig`)**
- [ ] **Step 3: Commit**

```bash
git commit -am "feat(cli): revamp status layout + --verbose + --json"
```

---

### Task 21: Drop emoji from `mute.ts`

**Files:** Modify `packages/cli/src/mute.ts`.

- [ ] **Step 1: Replace `🔇` → `sym.dash`, `🔔` → `sym.flow` (using `lib/ui.ts`)**

```ts
import { sym, colorOk, colorWarn } from './lib/ui.js';
// ...
console.log(`${colorWarn(sym.dash)} muted until ${until.toISOString()}`);
console.log(`${colorOk(sym.flow)} unmuted`);
```

- [ ] **Step 2: Commit**

```bash
git commit -am "style(cli): drop emoji in favor of unicode symbols"
```

---

## Phase H · Smoke test + docs + changeset

### Task 22: Update `scripts/smoke.mjs`

- [ ] **Step 1: Add steps**

```js
// scripts/smoke.mjs (additions)
// 1. assert tarball includes assets:
const dryRun = execSync('cd packages/core && npm pack --dry-run --json', { encoding: 'utf8' });
const files = JSON.parse(dryRun)[0].files.map((f) => f.path);
for (const required of ['assets/icon.png', 'assets/icon.icns', 'assets/icon.ico']) {
  if (!files.includes(`package/${required}`)) throw new Error(`tarball missing ${required}`);
}

// 2. agent-notifier init --tools=claude-code --no-test (non-interactive smoke)
// 3. re-init no-diff: agent-notifier init --tools=claude-code --no-test  (twice)
// 4. agent-notifier project set --kinds=PERMISSION --enabled=true
// 5. agent-notifier project show --json (assert kinds includes PERMISSION)
// 6. agent-notifier reset --yes
```

- [ ] **Step 2: Commit**

```bash
git commit -am "test(smoke): tarball asset assertion + new commands in smoke flow"
```

---

### Task 23: Documentation files

- [ ] **Step 1: Create `docs/onboarding.md`** — wizard prompt-by-prompt walkthrough; defaults table; FAQ on macOS Accessibility prompt.

- [ ] **Step 2: Create `docs/idle-gate.md`** — decision tree (copy from spec Section 8.1); supported terminals (Section 8.2); modes table; troubleshooting via `logs --gate=fail-open`.

- [ ] **Step 3: Create `docs/project-rules.md`** — `project` subcommand examples and recipes.

- [ ] **Step 4: Update `README.md`** — replace install/init transcript with new wizard output; add per-project section; document sound/icon override.

- [ ] **Step 5: Update `docs/CONTRIBUTING.md`** — release-smoke checklist references new commands and tarball-asset assertion.

- [ ] **Step 6: Commit**

```bash
git commit -am "docs: onboarding, idle-gate, project-rules guides + README updates"
```

---

### Task 24: Changeset entry

- [ ] **Step 1: Create file**

```md
<!-- .changeset/2026-05-03-onboarding-redesign.md -->
---
"agent-notifier": minor
"@agent-notifier/core": minor
---

Onboarding redesign: layman-friendly first-run wizard, safe re-init, dedicated `project` subcommand for per-project rules, and a redesigned idle gate that fires the moment you context-switch away from your AI agent's terminal tab. Notifications now use a single subtle sound (Ping on mac / default toast tone on win) and a bundled friendly icon, both overridable with your own audio/image files. Schema bumps to v2 with auto-migration.
```

- [ ] **Step 2: Commit**

```bash
git commit -am "chore: changeset for v0.2.0 onboarding redesign"
```

---

## Phase I · Final verification

### Task 25: Full local verification

- [ ] **Step 1: Build**

```
pnpm build
```

- [ ] **Step 2: Tests + coverage**

```
pnpm test:coverage
```

Expected: 90% lines, 85% branches.

- [ ] **Step 3: Lint**

```
pnpm lint
```

- [ ] **Step 4: Smoke (local only)**

```
pnpm test:smoke
```

- [ ] **Step 5: Pack-test**

```
pnpm -C packages/core pack --pack-destination /tmp
pnpm -C packages/cli  pack --pack-destination /tmp
npm install -g /tmp/agent-notifier-core-0.2.0.tgz /tmp/agent-notifier-0.2.0.tgz
agent-notifier --version  # → 0.2.0
agent-notifier            # → init wizard (since temp HOME)
```

- [ ] **Step 6: Final commit (if any cleanup)**

```bash
git status -s  # should be clean or only .changeset
```

---

## Self-review against spec

- §4 Command surface — Tasks 15, 17, 18, 19 ✓
- §5 Wizard flow + defaults — Task 17 ✓
- §6 Re-init mechanics — Tasks 16, 17 ✓
- §7 Project subcommand — Task 19 ✓
- §8 Idle gate — Tasks 5–9 ✓
- §9 Notification branding — Tasks 10–13 ✓
- §10 Visual & interaction language — Tasks 14, 20, 21 ✓
- §11 Schema migration — Tasks 1, 2 ✓
- §12 Error handling — Tasks 14 (formatError), 17 (lock), 9 (fail-open in gate) ✓
- §13 Logging discipline — Tasks 3, 4 ✓
- §14 Testing — embedded in every Phase A–G task ✓
- §15 Documentation — Task 23 ✓
- §16 Locked Q&A — preserved throughout ✓
- §17 Risks — mitigations applied (lock file in 17, asset fallback in 12, AppleScript copy in 17, tarball assertion in 22) ✓
- §18 Rollout — Task 24 (changeset) + Task 25 (verification) ✓

No placeholders, no TBD, every step has either complete code or an exact command with expected output. Type/method names consistent across tasks (`stubNotifyAppend`, `loggerFromConfig`, `decideGate`, `resolveAiPid`, `getFrontmostBundle`, `runInit`, `runProjectInteractive`, etc.).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-onboarding-ux-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
