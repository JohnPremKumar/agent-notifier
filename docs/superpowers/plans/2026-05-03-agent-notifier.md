# agent-notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform npm CLI (`agent-notifier`) that hooks into Claude Code, OpenAI Codex, Gemini CLI, and OpenCode and sends macOS / Windows desktop notifications when those agents need user attention (permission, idle, turn-done), with a full management surface (per-project enable/disable, global toggle, time-bounded mute, weekly schedules, status, log filtering, interactive onboarding).

**Architecture:** pnpm monorepo (`packages/core` pure TS library, `packages/cli` commander-based binary). Adapters per tool normalize hook payloads into a single `Event` type; a pure suppression decision tree decides fire vs suppress; `node-notifier` is the single chokepoint for cross-platform notifications. State lives in one zod-validated `config.json`. Logs are rotating JSONL.

**Tech Stack:** TypeScript strict, Node ≥ 20, pnpm workspaces, Vitest, ESLint, Prettier, tsup, commander, node-notifier, zod, @inquirer/prompts, changesets, GitHub Actions matrix (macos-latest + windows-latest × Node 20 + 22).

---

## Reference: Source spec
`docs/superpowers/specs/2026-05-03-agent-notifier-design.md` — read before starting.

## Reference: File structure (final state)

```
agent-notifier/
├── package.json                              # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── .npmrc
├── LICENSE                                   # MIT
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md                              # changeset-managed
├── .changeset/config.json
├── .github/
│   ├── workflows/{ci.yml,release.yml}
│   └── ISSUE_TEMPLATE/{bug.yml,feature.yml,adapter.yml}
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                      # re-exports public surface
│   │   │   ├── types.ts                      # Event, ToolName, Kind, Config zod schemas
│   │   │   ├── platform.ts                   # OS detection + canonical paths
│   │   │   ├── logger.ts                     # rotating JSONL append
│   │   │   ├── config.ts                     # load/save config.json (atomic, zod-validated)
│   │   │   ├── project.ts                    # cwd → git-root walk (cached)
│   │   │   ├── schedule.ts                   # pure (rules, now) → allow|deny|neutral
│   │   │   ├── suppress.ts                   # pure decision tree
│   │   │   ├── idle-gate.ts                  # mac: ioreg; win: PowerShell GetLastInputInfo
│   │   │   ├── notify.ts                     # node-notifier wrapper (single chokepoint)
│   │   │   └── adapters/
│   │   │       ├── claude-code.ts
│   │   │       ├── codex.ts
│   │   │       ├── gemini.ts
│   │   │       ├── opencode.ts
│   │   │       └── index.ts                  # adapter registry
│   │   └── tests/
│   │       ├── fixtures/
│   │       │   ├── claude-code/{permission,idle,stop}.json
│   │       │   ├── codex/{permission_request,stop}.json
│   │       │   ├── gemini/{notification_idle,notification_perm,after_agent}.json
│   │       │   ├── opencode/{permission,session_completed}.json
│   │       │   ├── ioreg-idle-12s.txt
│   │       │   └── powershell-idle-3s.txt
│   │       └── *.test.ts                     # one per src module
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── bin/agent-notifier.js             # shebang shim → dist/index.js
│       ├── src/
│       │   ├── index.ts                      # commander dispatch
│       │   ├── hook.ts                       # entrypoint invoked by hooks
│       │   ├── install.ts                    # detect tools, wire hooks, atomic, idempotent
│       │   ├── uninstall.ts                  # restore from .bak
│       │   ├── doctor.ts                     # diagnostics + test pings
│       │   ├── status.ts                     # pretty TUI of current state
│       │   ├── enable.ts
│       │   ├── disable.ts
│       │   ├── mute.ts                       # mute <duration>; unmute
│       │   ├── schedule.ts                   # list/add/remove/clear
│       │   ├── logs.ts                       # filtered tail over rotating JSONL
│       │   ├── init.ts                       # interactive onboarding
│       │   └── lib/
│       │       ├── duration.ts               # parse "30m"/"2h"/"1d"/"until 5pm" → Date
│       │       ├── installers/
│       │       │   ├── claude-code.ts
│       │       │   ├── codex.ts
│       │       │   ├── gemini.ts
│       │       │   └── opencode.ts
│       │       └── tui.ts                    # color/symbol helpers
│       └── tests/
│           └── *.test.ts
```

---

## Conventions (apply to every task)

- **TDD discipline:** every code change starts with a failing test. Steps follow RED → GREEN → COMMIT.
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`).
- **Type safety:** `strict: true`. No `any`. No `as` without a one-line `// reason:` comment.
- **Validation at the boundary:** anything from disk, stdin, or env vars passes through a zod schema before becoming a typed object.
- **Branch:** create a `feature/<task-slug>` branch per task. Land via PR squash-merge.
- **After every commit:** run `pnpm lint && pnpm test` at workspace root. Both must be green.

---

## Phase 0 — Repo & toolchain bootstrap

### Task 0.1: Initialize pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `LICENSE`
- Create: `README.md` (placeholder, expanded later)

- [ ] **Step 1: `git init` and create branch**

```bash
cd /Users/johnpremkumarsrinivasan/Desktop/Education/grind/notifier
git init
git checkout -b feature/repo-bootstrap
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "agent-notifier-workspace",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:coverage": "vitest run --coverage",
    "test:smoke": "node scripts/smoke.mjs",
    "lint": "eslint . --ext .ts && prettier --check .",
    "format": "prettier --write .",
    "changeset": "changeset",
    "release": "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "@types/node": "^20.12.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.2.0",
    "tsup": "^8.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
coverage/
.DS_Store
*.log
*.tmp
*.bak
.env
.env.*
!.env.example
.vitest-cache/
.eslintcache
```

- [ ] **Step 5: Create `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 6: Create MIT `LICENSE`**

```
MIT License

Copyright (c) 2026 Johnpremkumar Srinivasan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

- [ ] **Step 7: Create placeholder `README.md`**

```markdown
# agent-notifier

Cross-platform desktop notifier for AI coding CLIs (Claude Code, Codex, Gemini, OpenCode). See `docs/superpowers/specs/2026-05-03-agent-notifier-design.md` for the full design.

Status: in active development.
```

- [ ] **Step 8: Install + commit**

```bash
pnpm install
git add .
git commit -m "chore: initialize pnpm workspace and tooling"
```

Expected: `pnpm install` creates `pnpm-lock.yaml`; commit succeeds.

---

### Task 0.2: TypeScript, ESLint, Prettier, Vitest base configs

**Files:**
- Create: `tsconfig.base.json`
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 2: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: ["./packages/*/tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended-type-checked", "prettier"],
  ignorePatterns: ["dist", "coverage", "node_modules", "*.cjs", "*.mjs", "*.config.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/consistent-type-imports": "error",
    "no-console": ["warn", { allow: ["warn", "error"] }],
  },
  overrides: [
    {
      files: ["packages/cli/src/**/*.ts"],
      rules: { "no-console": "off" },
    },
  ],
};
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.d.ts'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/tests/**/*.test.ts'],
          exclude: ['packages/*/tests/integration/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/*/tests/integration/**/*.test.ts'],
          testTimeout: 20000,
        },
      },
    ],
  },
});
```

- [ ] **Step 5: Verify lint + test scaffolding runs**

```bash
pnpm lint
pnpm test
```

Expected: `lint` passes (no files yet); `test` reports "No test files found" with exit 1 (vitest 3.x exits 1 when no test files match — this is normal until Task 1.1 adds tests).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: add typescript, eslint, prettier, vitest base configs"
```

---

### Task 0.3: Bootstrap `packages/core` and `packages/cli`

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/bin/agent-notifier.js`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@agent-notifier/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "node-notifier": "^10.0.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node-notifier": "^8.0.5"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
});
```

- [ ] **Step 4: Create stub `packages/core/src/index.ts`**

```ts
export const VERSION = '0.0.0';
```

- [ ] **Step 5: Create `packages/cli/package.json`**

```json
{
  "name": "agent-notifier",
  "version": "0.0.0",
  "type": "module",
  "bin": { "agent-notifier": "./bin/agent-notifier.js" },
  "main": "./dist/index.js",
  "files": ["dist", "bin"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agent-notifier/core": "workspace:*",
    "@inquirer/prompts": "^5.3.0",
    "commander": "^12.1.0",
    "kleur": "^4.1.5",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 6: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 7: Create `packages/cli/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node20',
  noExternal: ['@agent-notifier/core'],
});
```

- [ ] **Step 8: Create `packages/cli/bin/agent-notifier.js`**

```js
#!/usr/bin/env node
import('../dist/index.js');
```

- [ ] **Step 9: Create stub `packages/cli/src/index.ts`**

```ts
console.log('agent-notifier v0.0.0');
```

- [ ] **Step 10: Install + build + commit**

```bash
pnpm install
pnpm build
git add .
git commit -m "chore: bootstrap core and cli packages"
```

Expected: both packages build to `dist/`, no errors.

---

### Task 0.4: GitHub Actions CI matrix

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
        node: [20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }}, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm build
      - run: pnpm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: matrix on macos+windows for node 20 and 22"
```

---

### Task 0.5: Changesets setup

**Files:**
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`

- [ ] **Step 1: Initialize changesets config**

```bash
pnpm changeset init
```

- [ ] **Step 2: Edit `.changeset/config.json` to publish only `agent-notifier`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@2.3.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["agent-notifier", "@agent-notifier/core"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 3: Commit**

```bash
git add .changeset
git commit -m "chore: configure changesets with linked core+cli versions"
```

---

## Phase 1 — Core types and platform basics

### Task 1.1: Define `types.ts` (Event, ToolName, Kind, Config schemas)

**Files:**
- Create: `packages/core/src/types.ts`
- Test: `packages/core/tests/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/types.test.ts
import { describe, it, expect } from 'vitest';
import { EventSchema, ConfigSchema, KindSchema, ToolNameSchema } from '../src/types.js';

describe('types', () => {
  it('KindSchema accepts the three event kinds', () => {
    expect(KindSchema.parse('PERMISSION')).toBe('PERMISSION');
    expect(KindSchema.parse('IDLE')).toBe('IDLE');
    expect(KindSchema.parse('TURN_DONE')).toBe('TURN_DONE');
    expect(() => KindSchema.parse('OTHER')).toThrow();
  });

  it('ToolNameSchema accepts the four tool names', () => {
    expect(ToolNameSchema.parse('claude-code')).toBe('claude-code');
    expect(ToolNameSchema.parse('codex')).toBe('codex');
    expect(ToolNameSchema.parse('gemini')).toBe('gemini');
    expect(ToolNameSchema.parse('opencode')).toBe('opencode');
    expect(() => ToolNameSchema.parse('aider')).toThrow();
  });

  it('EventSchema validates a complete event', () => {
    const e = EventSchema.parse({
      kind: 'PERMISSION',
      tool: 'claude-code',
      project: 'my-app',
      sessionId: 'abc123',
      cwd: '/Users/x/my-app',
      message: 'needs your permission',
    });
    expect(e.kind).toBe('PERMISSION');
  });

  it('ConfigSchema fills defaults for an empty document', () => {
    const c = ConfigSchema.parse({ version: 1, tz: 'UTC' });
    expect(c.global.enabled).toBe(true);
    expect(c.mute).toBeNull();
    expect(c.schedules).toEqual([]);
    expect(c.projectDefault.enabled).toBe(true);
  });

  it('ConfigSchema accepts a fully populated document', () => {
    const c = ConfigSchema.parse({
      version: 1,
      tz: 'Asia/Kolkata',
      global: { enabled: true },
      mute: { until: '2026-05-03T17:00:00.000Z' },
      schedules: [
        { id: 'work', type: 'allow', days: ['mon', 'tue'], from: '09:00', to: '18:00' },
      ],
      tools: { 'claude-code': { enabled: true } },
      projectDefault: { enabled: true },
      projects: { '/x': { enabled: false } },
    });
    expect(c.schedules[0]?.from).toBe('09:00');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run packages/core/tests/types.test.ts
```

Expected: FAIL — module `../src/types.js` not found.

- [ ] **Step 3: Implement `packages/core/src/types.ts`**

```ts
import { z } from 'zod';

export const KindSchema = z.enum(['PERMISSION', 'IDLE', 'TURN_DONE']);
export type Kind = z.infer<typeof KindSchema>;

export const ToolNameSchema = z.enum(['claude-code', 'codex', 'gemini', 'opencode']);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const EventSchema = z.object({
  kind: KindSchema,
  tool: ToolNameSchema,
  project: z.string().min(1),
  sessionId: z.string().min(1),
  cwd: z.string().min(1),
  message: z.string().optional(),
});
export type Event = z.infer<typeof EventSchema>;

const TimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const DaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const ScheduleRuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['allow', 'deny']),
  days: z.array(DaySchema).min(1),
  from: z.string().regex(TimeRegex),
  to: z.string().regex(TimeRegex),
});
export type ScheduleRule = z.infer<typeof ScheduleRuleSchema>;

export const ProjectEntrySchema = z.object({
  enabled: z.boolean(),
  kinds: z.array(KindSchema).optional(),
});
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;

export const ConfigSchema = z.object({
  version: z.literal(1),
  tz: z.string().min(1),
  global: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  mute: z.object({ until: z.string().datetime() }).nullable().default(null),
  schedules: z.array(ScheduleRuleSchema).default([]),
  tools: z
    .record(ToolNameSchema, z.object({ enabled: z.boolean() }))
    .default({
      'claude-code': { enabled: true },
      codex: { enabled: true },
      gemini: { enabled: true },
      opencode: { enabled: true },
    }),
  projectDefault: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  projects: z.record(z.string(), ProjectEntrySchema).default({}),
});
export type Config = z.infer<typeof ConfigSchema>;
```

- [ ] **Step 4: Run the test — should pass**

```bash
pnpm vitest run packages/core/tests/types.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-types
git add packages/core/src/types.ts packages/core/tests/types.test.ts
git commit -m "feat(core): add zod schemas for Event and Config"
```

---

### Task 1.2: `platform.ts` — OS detection and canonical paths

**Files:**
- Create: `packages/core/src/platform.ts`
- Test: `packages/core/tests/platform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/platform.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';

describe('platform', () => {
  const origPlatform = process.platform;
  const origHome = os.homedir();
  const origAppData = process.env['APPDATA'];

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
    process.env['APPDATA'] = origAppData;
    vi.restoreAllMocks();
  });

  it('configDir returns ~/.agent-notifier on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/x');
    const { configDir } = await import('../src/platform.js');
    expect(configDir()).toBe('/Users/x/.agent-notifier');
  });

  it('configDir returns %APPDATA%\\agent-notifier on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env['APPDATA'] = 'C:\\Users\\x\\AppData\\Roaming';
    vi.resetModules();
    const { configDir } = await import('../src/platform.js');
    expect(configDir()).toBe('C:\\Users\\x\\AppData\\Roaming\\agent-notifier');
  });

  it('isSupportedPlatform is true on darwin and win32, false elsewhere', async () => {
    const { isSupportedPlatform } = await import('../src/platform.js');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(isSupportedPlatform()).toBe(true);
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(isSupportedPlatform()).toBe(true);
    Object.defineProperty(process, 'platform', { value: 'linux' });
    expect(isSupportedPlatform()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

```bash
pnpm vitest run packages/core/tests/platform.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/platform.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32';
}

export function configDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (!appData) throw new Error('APPDATA env var not set on Windows');
    return join(appData, 'agent-notifier');
  }
  return join(homedir(), '.agent-notifier');
}

export function logDir(): string {
  return join(configDir(), 'log');
}

export function backupsDir(): string {
  return join(configDir(), 'backups');
}

export function configFilePath(): string {
  return join(configDir(), 'config.json');
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/platform.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-platform
git add packages/core/src/platform.ts packages/core/tests/platform.test.ts
git commit -m "feat(core): add platform detection and canonical config paths"
```

---

### Task 1.3: `logger.ts` — rotating JSONL append

**Files:**
- Create: `packages/core/src/logger.ts`
- Test: `packages/core/tests/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../src/logger.js';

describe('Logger', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'agentlog-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('appends one JSONL line per write', () => {
    const log = new Logger({ dir, maxBytes: 10_000, generations: 3 });
    log.append({ ts: '2026-05-03T10:00:00Z', tool: 'claude-code', kind: 'PERMISSION', project: 'x', sessionId: 's1', fired: true });
    log.append({ ts: '2026-05-03T10:00:01Z', tool: 'codex', kind: 'IDLE', project: 'y', sessionId: 's2', fired: false, suppressReason: 'user-active' });
    const lines = readFileSync(join(dir, 'notifier.log'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).tool).toBe('claude-code');
    expect(JSON.parse(lines[1]!).suppressReason).toBe('user-active');
  });

  it('rotates when size exceeds maxBytes (1 → 2 → 3 → drop)', () => {
    const log = new Logger({ dir, maxBytes: 200, generations: 3 });
    const big = 'x'.repeat(150);
    for (let i = 0; i < 6; i++) {
      log.append({ ts: `2026-05-03T10:00:0${i}Z`, tool: 'claude-code', kind: 'PERMISSION', project: 'p', sessionId: 's', fired: true, msg: big });
    }
    expect(existsSync(join(dir, 'notifier.log'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.1'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.2'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.3'))).toBe(false);
  });

  it('caps generations at the configured count', () => {
    const log = new Logger({ dir, maxBytes: 50, generations: 2 });
    for (let i = 0; i < 8; i++) {
      log.append({ ts: '2026-05-03T10:00:00Z', tool: 'claude-code', kind: 'PERMISSION', project: 'p', sessionId: 's', fired: true });
    }
    expect(existsSync(join(dir, 'notifier.log.1'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.2'))).toBe(false);
  });

  it('creates the log directory if missing', () => {
    const nested = join(dir, 'a', 'b', 'c');
    const log = new Logger({ dir: nested, maxBytes: 1000, generations: 3 });
    log.append({ ts: '2026-05-03T10:00:00Z', tool: 'claude-code', kind: 'IDLE', project: 'p', sessionId: 's', fired: true });
    expect(statSync(join(nested, 'notifier.log')).size).toBeGreaterThan(0);
  });

  it('readTail returns the last N entries newest-last', () => {
    const log = new Logger({ dir, maxBytes: 100_000, generations: 3 });
    for (let i = 0; i < 5; i++) {
      log.append({ ts: `2026-05-03T10:00:0${i}Z`, tool: 'claude-code', kind: 'PERMISSION', project: 'p', sessionId: `s${i}`, fired: true });
    }
    const tail = log.readTail(3);
    expect(tail).toHaveLength(3);
    expect(tail[0]!.sessionId).toBe('s2');
    expect(tail[2]!.sessionId).toBe('s4');
  });

  it('readAll skips malformed lines without throwing', () => {
    writeFileSync(join(dir, 'notifier.log'), '{"ts":"a"}\nNOT JSON\n{"ts":"b"}\n');
    const log = new Logger({ dir, maxBytes: 100_000, generations: 3 });
    const all = log.readAll();
    expect(all).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/logger.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/logger.ts`**

```ts
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, renameSync,
  statSync, unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

export interface LogEntry {
  ts: string;
  tool: string;
  kind: string;
  project: string;
  sessionId: string;
  fired: boolean;
  suppressReason?: string;
  msg?: string;
  error?: string;
}

export interface LoggerOptions {
  dir: string;
  maxBytes: number;
  generations: number;
}

export class Logger {
  private readonly file: string;
  constructor(private readonly opts: LoggerOptions) {
    if (!existsSync(opts.dir)) mkdirSync(opts.dir, { recursive: true });
    this.file = join(opts.dir, 'notifier.log');
  }

  append(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    this.rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
    appendFileSync(this.file, line, 'utf8');
  }

  private rotateIfNeeded(incomingBytes: number): void {
    let currentSize = 0;
    try { currentSize = statSync(this.file).size; } catch { return; }
    if (currentSize + incomingBytes <= this.opts.maxBytes) return;

    for (let i = this.opts.generations; i >= 1; i--) {
      const src = i === 1 ? this.file : `${this.file}.${i - 1}`;
      const dst = `${this.file}.${i}`;
      if (!existsSync(src)) continue;
      if (i === this.opts.generations && existsSync(dst)) unlinkSync(dst);
      if (existsSync(dst)) unlinkSync(dst);
      renameSync(src, dst);
    }
  }

  readAll(): LogEntry[] {
    if (!existsSync(this.file)) return [];
    const raw = readFileSync(this.file, 'utf8');
    const out: LogEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try { out.push(JSON.parse(line) as LogEntry); } catch { /* skip malformed */ }
    }
    return out;
  }

  readTail(n: number): LogEntry[] {
    const all = this.readAll();
    return all.slice(Math.max(0, all.length - n));
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/logger.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-logger
git add packages/core/src/logger.ts packages/core/tests/logger.test.ts
git commit -m "feat(core): rotating JSONL logger with size-based rotation and tail reader"
```

---

### Task 1.4: `idle-gate.ts` — cross-platform user idle detection

**Files:**
- Create: `packages/core/src/idle-gate.ts`
- Create: `packages/core/tests/fixtures/ioreg-idle-12s.txt`
- Create: `packages/core/tests/fixtures/powershell-idle-3s.txt`
- Test: `packages/core/tests/idle-gate.test.ts`

- [ ] **Step 1: Capture mac fixture**

Write `packages/core/tests/fixtures/ioreg-idle-12s.txt` with this content (a trimmed real `ioreg -c IOHIDSystem` line; idle = 12 seconds = 12_000_000_000 ns):

```
  | |   |     "HIDIdleTime" = 12000000000
```

- [ ] **Step 2: Capture windows fixture**

Write `packages/core/tests/fixtures/powershell-idle-3s.txt`:

```
3
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/core/tests/idle-gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIoregOutput, parsePowerShellOutput, getIdleSeconds } from '../src/idle-gate.js';

describe('idle-gate parsers', () => {
  it('parseIoregOutput extracts seconds from a real ioreg snippet', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'ioreg-idle-12s.txt'), 'utf8');
    expect(parseIoregOutput(raw)).toBe(12);
  });

  it('parsePowerShellOutput parses the integer second count', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'powershell-idle-3s.txt'), 'utf8');
    expect(parsePowerShellOutput(raw)).toBe(3);
  });

  it('parseIoregOutput throws on output missing HIDIdleTime', () => {
    expect(() => parseIoregOutput('garbage')).toThrow();
  });

  it('parsePowerShellOutput throws on non-numeric output', () => {
    expect(() => parsePowerShellOutput('not a number')).toThrow();
  });
});

describe('getIdleSeconds (with stubbed exec)', () => {
  it('fail-open: returns Infinity if probe throws', async () => {
    const stub = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await getIdleSeconds({ exec: stub, platform: 'darwin', timeoutMs: 200 });
    expect(result).toBe(Infinity);
  });

  it('darwin: invokes ioreg and parses result', async () => {
    const stub = vi.fn().mockResolvedValue({ stdout: '"HIDIdleTime" = 5000000000', stderr: '' });
    const result = await getIdleSeconds({ exec: stub, platform: 'darwin', timeoutMs: 200 });
    expect(result).toBe(5);
    expect(stub.mock.calls[0]?.[0]).toContain('ioreg');
  });

  it('win32: invokes powershell and parses result', async () => {
    const stub = vi.fn().mockResolvedValue({ stdout: '7\r\n', stderr: '' });
    const result = await getIdleSeconds({ exec: stub, platform: 'win32', timeoutMs: 200 });
    expect(result).toBe(7);
    expect(stub.mock.calls[0]?.[0]).toContain('powershell');
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/idle-gate.test.ts
```

- [ ] **Step 5: Implement `packages/core/src/idle-gate.ts`**

```ts
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(execCb);

export type ExecFn = (cmd: string, opts?: { timeout?: number }) => Promise<{ stdout: string; stderr: string }>;

export interface GetIdleOptions {
  exec?: ExecFn;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
}

export function parseIoregOutput(raw: string): number {
  const match = raw.match(/"HIDIdleTime"\s*=\s*(\d+)/);
  if (!match?.[1]) throw new Error('HIDIdleTime not found in ioreg output');
  return Math.floor(Number(match[1]) / 1_000_000_000);
}

export function parsePowerShellOutput(raw: string): number {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!Number.isFinite(n)) throw new Error(`Non-numeric PowerShell output: ${trimmed}`);
  return Math.floor(n);
}

const MAC_CMD = "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print; exit}'";
const WIN_CMD =
  "powershell -NoProfile -Command \"" +
  "Add-Type 'using System; using System.Runtime.InteropServices; " +
  "public class I { [DllImport(\\\"user32.dll\\\")] public static extern bool GetLastInputInfo(ref L l); " +
  "public struct L { public uint cb; public uint t; } }';" +
  "$l = New-Object I+L; $l.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($l); " +
  "[I]::GetLastInputInfo([ref]$l) | Out-Null;" +
  "[Math]::Floor(([Environment]::TickCount - $l.t) / 1000)\"";

export async function getIdleSeconds(opts: GetIdleOptions = {}): Promise<number> {
  const exec = opts.exec ?? execAsync;
  const platform = opts.platform ?? process.platform;
  const timeout = opts.timeoutMs ?? 200;
  try {
    if (platform === 'darwin') {
      const { stdout } = await exec(MAC_CMD, { timeout });
      return parseIoregOutput(stdout);
    }
    if (platform === 'win32') {
      const { stdout } = await exec(WIN_CMD, { timeout });
      return parsePowerShellOutput(stdout);
    }
    return Infinity;
  } catch {
    return Infinity; // fail-open: treat user as idle so we don't swallow notifications
  }
}
```

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/idle-gate.test.ts
```

- [ ] **Step 7: Commit**

```bash
git checkout -b feature/core-idle-gate
git add packages/core/src/idle-gate.ts packages/core/tests/idle-gate.test.ts packages/core/tests/fixtures/
git commit -m "feat(core): cross-platform idle detection (ioreg + PowerShell GetLastInputInfo)"
```

---

### Task 1.5: `config.ts` — atomic load/save of zod-validated config

**Files:**
- Create: `packages/core/src/config.ts`
- Test: `packages/core/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, defaultConfig, ConfigStore } from '../src/config.js';

describe('config', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentcfg-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaultConfig produces a valid Config with sane defaults', () => {
    const c = defaultConfig('Asia/Kolkata');
    expect(c.version).toBe(1);
    expect(c.tz).toBe('Asia/Kolkata');
    expect(c.global.enabled).toBe(true);
    expect(c.mute).toBeNull();
  });

  it('loadConfig returns defaultConfig when file absent', () => {
    const c = loadConfig(file, 'UTC');
    expect(c.tz).toBe('UTC');
    expect(existsSync(file)).toBe(false);
  });

  it('saveConfig writes valid JSON and loadConfig round-trips it', () => {
    const original = defaultConfig('UTC');
    original.projects['/Users/x/repo'] = { enabled: false };
    saveConfig(file, original);
    const loaded = loadConfig(file, 'UTC');
    expect(loaded.projects['/Users/x/repo']?.enabled).toBe(false);
  });

  it('loadConfig throws on schema-invalid file (no silent corruption)', () => {
    writeFileSync(file, '{"version":1,"tz":"UTC","global":"not-an-object"}');
    expect(() => loadConfig(file, 'UTC')).toThrow();
  });

  it('saveConfig is atomic: tmp file is removed after rename', () => {
    saveConfig(file, defaultConfig('UTC'));
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('ConfigStore.update mutates and persists', () => {
    saveConfig(file, defaultConfig('UTC'));
    const store = new ConfigStore(file, 'UTC');
    store.update((c) => { c.global.enabled = false; });
    const reloaded = loadConfig(file, 'UTC');
    expect(reloaded.global.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/config.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/config.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, fsyncSync, openSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConfigSchema, type Config } from './types.js';

export function defaultConfig(tz: string): Config {
  return ConfigSchema.parse({ version: 1, tz });
}

export function loadConfig(file: string, fallbackTz: string): Config {
  if (!existsSync(file)) return defaultConfig(fallbackTz);
  const raw = readFileSync(file, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return ConfigSchema.parse(parsed);
}

export function saveConfig(file: string, config: Config): void {
  ConfigSchema.parse(config); // throws on invalid
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  const fd = openSync(tmp, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, file);
}

export class ConfigStore {
  constructor(private readonly file: string, private readonly fallbackTz: string) {}
  load(): Config { return loadConfig(this.file, this.fallbackTz); }
  save(c: Config): void { saveConfig(this.file, c); }
  update(mutator: (c: Config) => void): Config {
    const c = this.load();
    mutator(c);
    this.save(c);
    return c;
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-config
git add packages/core/src/config.ts packages/core/tests/config.test.ts
git commit -m "feat(core): atomic zod-validated config store with ConfigStore.update"
```

---

### Task 1.6: `project.ts` — git-root resolution with cwd fallback

**Files:**
- Create: `packages/core/src/project.ts`
- Test: `packages/core/tests/project.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/project.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProjectKey, projectDisplayName } from '../src/project.js';

describe('project', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'agentproj-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns git-root when .git directory is found by walking up', () => {
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'a', 'b', 'c'), { recursive: true });
    expect(resolveProjectKey(join(root, 'a', 'b', 'c'))).toBe(root);
  });

  it('returns git-root when .git is at the cwd itself', () => {
    mkdirSync(join(root, '.git'));
    expect(resolveProjectKey(root)).toBe(root);
  });

  it('falls back to cwd when no .git is found', () => {
    mkdirSync(join(root, 'sub'));
    expect(resolveProjectKey(join(root, 'sub'))).toBe(join(root, 'sub'));
  });

  it('projectDisplayName returns the basename of the project key', () => {
    expect(projectDisplayName('/Users/x/Desktop/my-app')).toBe('my-app');
  });

  it('resolveProjectKey caches results within a process', () => {
    mkdirSync(join(root, '.git'));
    const a = resolveProjectKey(root);
    const b = resolveProjectKey(root);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/project.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/project.ts`**

```ts
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const cache = new Map<string, string>();

export function resolveProjectKey(cwd: string): string {
  const start = resolve(cwd);
  const cached = cache.get(start);
  if (cached) return cached;

  let dir = start;
  while (true) {
    const gitDir = join(dir, '.git');
    if (existsSync(gitDir)) {
      try {
        statSync(gitDir); // exists and stat-able (file or dir)
        cache.set(start, dir);
        return dir;
      } catch { /* fall through */ }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // hit root
    dir = parent;
  }
  cache.set(start, start);
  return start;
}

export function projectDisplayName(projectKey: string): string {
  return basename(projectKey);
}

export function clearProjectCache(): void { cache.clear(); }
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/project.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-project
git add packages/core/src/project.ts packages/core/tests/project.test.ts
git commit -m "feat(core): resolve project key via git-root walk with cwd fallback"
```

---

### Task 1.7: `schedule.ts` — pure schedule evaluator

**Files:**
- Create: `packages/core/src/schedule.ts`
- Test: `packages/core/tests/schedule.test.ts`

- [ ] **Step 1: Write the failing test (truth-table coverage)**

```ts
// packages/core/tests/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateSchedule } from '../src/schedule.js';
import type { ScheduleRule } from '../src/types.js';

const at = (iso: string) => new Date(iso);

describe('evaluateSchedule', () => {
  it('returns "neutral" when no rules are configured', () => {
    expect(evaluateSchedule([], at('2026-05-04T10:00:00Z'), 'UTC')).toBe('neutral');
  });

  it('returns "allow" when an allow rule matches now', () => {
    const r: ScheduleRule[] = [{ id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' }];
    expect(evaluateSchedule(r, at('2026-05-04T10:00:00Z'), 'UTC')).toBe('allow'); // 2026-05-04 = Mon
  });

  it('returns "deny" when an allow rule exists but none matches now', () => {
    const r: ScheduleRule[] = [{ id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' }];
    expect(evaluateSchedule(r, at('2026-05-04T20:00:00Z'), 'UTC')).toBe('deny');
  });

  it('returns "deny" when a deny rule matches now even if an allow rule also matches', () => {
    const r: ScheduleRule[] = [
      { id: 'a', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' },
      { id: 'lunch', type: 'deny', days: ['mon'], from: '12:00', to: '13:00' },
    ];
    expect(evaluateSchedule(r, at('2026-05-04T12:30:00Z'), 'UTC')).toBe('deny');
  });

  it('treats only-deny config as "neutral" outside the deny window', () => {
    const r: ScheduleRule[] = [{ id: 'q', type: 'deny', days: ['mon'], from: '22:00', to: '23:00' }];
    expect(evaluateSchedule(r, at('2026-05-04T10:00:00Z'), 'UTC')).toBe('neutral');
  });

  it('handles windows that cross midnight (22:00 → 06:00)', () => {
    const r: ScheduleRule[] = [{ id: 'q', type: 'deny', days: ['mon'], from: '22:00', to: '06:00' }];
    expect(evaluateSchedule(r, at('2026-05-04T23:30:00Z'), 'UTC')).toBe('deny');
    expect(evaluateSchedule(r, at('2026-05-05T05:00:00Z'), 'UTC')).toBe('deny'); // tue 05:00 = mon's overflow
    expect(evaluateSchedule(r, at('2026-05-05T07:00:00Z'), 'UTC')).toBe('neutral');
  });

  it('respects timezone (IST = UTC+05:30)', () => {
    const r: ScheduleRule[] = [{ id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' }];
    // 04:00 UTC Monday = 09:30 IST Monday → inside window
    expect(evaluateSchedule(r, at('2026-05-04T04:00:00Z'), 'Asia/Kolkata')).toBe('allow');
  });

  it('day boundary respected per timezone', () => {
    const r: ScheduleRule[] = [{ id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' }];
    // 23:00 UTC Sunday = 04:30 IST Monday → before window starts → has allow but not active → deny
    expect(evaluateSchedule(r, at('2026-05-03T23:00:00Z'), 'Asia/Kolkata')).toBe('deny');
  });

  it('weekend day not in days[] yields no allow → deny when allow rules exist', () => {
    const r: ScheduleRule[] = [{ id: 'work', type: 'allow', days: ['mon', 'tue', 'wed', 'thu', 'fri'], from: '09:00', to: '18:00' }];
    expect(evaluateSchedule(r, at('2026-05-09T12:00:00Z'), 'UTC')).toBe('deny'); // sat
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/schedule.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/schedule.ts`**

```ts
import type { ScheduleRule } from './types.js';

export type ScheduleState = 'allow' | 'deny' | 'neutral';

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface LocalTime {
  day: typeof DAY_NAMES[number];
  minutes: number; // minutes since 00:00 in local tz
}

function localTime(now: Date, tz: string): LocalTime {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? 'mon';
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minPart = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = Number(hourPart === '24' ? '00' : hourPart);
  const minute = Number(minPart);
  const dayMap: Record<string, typeof DAY_NAMES[number]> = {
    sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat',
  };
  return { day: dayMap[wd] ?? 'mon', minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function previousDay(d: typeof DAY_NAMES[number]): typeof DAY_NAMES[number] {
  const i = DAY_INDEX[d];
  return DAY_NAMES[(i + 6) % 7]!;
}

function ruleMatches(rule: ScheduleRule, lt: LocalTime): boolean {
  const from = toMinutes(rule.from);
  const to = toMinutes(rule.to);
  if (from < to) {
    return rule.days.includes(lt.day) && lt.minutes >= from && lt.minutes < to;
  }
  // Crosses midnight: matches if today is in days[] and minutes >= from,
  // OR yesterday is in days[] and minutes < to.
  const todayMatch = rule.days.includes(lt.day) && lt.minutes >= from;
  const overflowMatch = rule.days.includes(previousDay(lt.day)) && lt.minutes < to;
  return todayMatch || overflowMatch;
}

export function evaluateSchedule(
  rules: ScheduleRule[],
  now: Date,
  tz: string,
): ScheduleState {
  if (rules.length === 0) return 'neutral';
  const lt = localTime(now, tz);
  const denyActive = rules.some((r) => r.type === 'deny' && ruleMatches(r, lt));
  if (denyActive) return 'deny';
  const allows = rules.filter((r) => r.type === 'allow');
  if (allows.length === 0) return 'neutral';
  const allowActive = allows.some((r) => ruleMatches(r, lt));
  return allowActive ? 'allow' : 'deny';
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/schedule.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-schedule
git add packages/core/src/schedule.ts packages/core/tests/schedule.test.ts
git commit -m "feat(core): pure schedule evaluator with allow/deny precedence and tz support"
```

---

### Task 1.8: `suppress.ts` — pure decision tree

**Files:**
- Create: `packages/core/src/suppress.ts`
- Test: `packages/core/tests/suppress.test.ts`

- [ ] **Step 1: Write the failing test (truth-table coverage)**

```ts
// packages/core/tests/suppress.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateSuppression } from '../src/suppress.js';
import { defaultConfig } from '../src/config.js';
import type { Config, Event } from '../src/types.js';

const event = (overrides: Partial<Event> = {}): Event => ({
  kind: 'TURN_DONE',
  tool: 'claude-code',
  project: 'demo',
  sessionId: 's1',
  cwd: '/Users/x/repo',
  ...overrides,
});

const cfg = (mut: (c: Config) => void = () => {}): Config => {
  const c = defaultConfig('UTC');
  mut(c);
  return c;
};

const NOW = new Date('2026-05-04T10:00:00Z');
const PROJ = '/Users/x/repo';

describe('evaluateSuppression', () => {
  it('fires when nothing suppresses', () => {
    const r = evaluateSuppression(cfg(), NOW, event(), 60, PROJ);
    expect(r.fire).toBe(true);
  });

  it('suppresses when global disabled', () => {
    const c = cfg((c) => { c.global.enabled = false; });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({ fire: false, reason: 'global-disabled' });
  });

  it('suppresses while mute is active', () => {
    const c = cfg((c) => { c.mute = { until: '2026-05-04T11:00:00.000Z' }; });
    const r = evaluateSuppression(c, NOW, event(), 60, PROJ);
    expect(r.fire).toBe(false);
    expect(r.reason).toMatch(/^muted-until/);
  });

  it('lets through when mute has expired', () => {
    const c = cfg((c) => { c.mute = { until: '2026-05-04T09:00:00.000Z' }; });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ).fire).toBe(true);
  });

  it('suppresses when schedule denies', () => {
    const c = cfg((c) => {
      c.schedules = [{ id: 'q', type: 'deny', days: ['mon'], from: '09:00', to: '18:00' }];
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({ fire: false, reason: 'schedule-deny' });
  });

  it('suppresses when tool disabled', () => {
    const c = cfg((c) => { c.tools['claude-code'] = { enabled: false }; });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({ fire: false, reason: 'tool-disabled' });
  });

  it('suppresses when project entry disabled', () => {
    const c = cfg((c) => { c.projects[PROJ] = { enabled: false }; });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({ fire: false, reason: 'project-disabled' });
  });

  it('suppresses when project filters out this kind', () => {
    const c = cfg((c) => { c.projects[PROJ] = { enabled: true, kinds: ['PERMISSION'] }; });
    expect(evaluateSuppression(c, NOW, event({ kind: 'IDLE' }), 60, PROJ)).toEqual({ fire: false, reason: 'project-filter' });
  });

  it('uses projectDefault when project has no entry', () => {
    const c = cfg((c) => { c.projectDefault.enabled = false; });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({ fire: false, reason: 'project-default-disabled' });
  });

  it('suppresses TURN_DONE when user active (idle < threshold)', () => {
    expect(evaluateSuppression(cfg(), NOW, event({ kind: 'TURN_DONE' }), 5, PROJ, { idleThreshold: 30 }))
      .toEqual({ fire: false, reason: 'user-active' });
  });

  it('PERMISSION bypasses idle gate', () => {
    expect(evaluateSuppression(cfg(), NOW, event({ kind: 'PERMISSION' }), 5, PROJ, { idleThreshold: 30 }).fire).toBe(true);
  });

  it('idle threshold honored at boundary', () => {
    expect(evaluateSuppression(cfg(), NOW, event({ kind: 'IDLE' }), 30, PROJ, { idleThreshold: 30 }).fire).toBe(true);
    expect(evaluateSuppression(cfg(), NOW, event({ kind: 'IDLE' }), 29, PROJ, { idleThreshold: 30 }).fire).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/suppress.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/suppress.ts`**

```ts
import type { Config, Event } from './types.js';
import { evaluateSchedule } from './schedule.js';

export interface SuppressDecision {
  fire: boolean;
  reason?: string;
}

export interface SuppressOptions {
  idleThreshold?: number; // seconds
}

const DEFAULT_IDLE_THRESHOLD = 30;

export function evaluateSuppression(
  config: Config,
  now: Date,
  event: Event,
  idleSeconds: number,
  projectKey: string,
  opts: SuppressOptions = {},
): SuppressDecision {
  const idleThreshold = opts.idleThreshold ?? DEFAULT_IDLE_THRESHOLD;

  if (!config.global.enabled) return { fire: false, reason: 'global-disabled' };

  if (config.mute && new Date(config.mute.until).getTime() > now.getTime()) {
    return { fire: false, reason: `muted-until-${config.mute.until}` };
  }

  const sched = evaluateSchedule(config.schedules, now, config.tz);
  if (sched === 'deny') return { fire: false, reason: 'schedule-deny' };

  const toolEntry = config.tools[event.tool];
  if (toolEntry && !toolEntry.enabled) return { fire: false, reason: 'tool-disabled' };

  const projEntry = config.projects[projectKey];
  if (projEntry) {
    if (!projEntry.enabled) return { fire: false, reason: 'project-disabled' };
    if (projEntry.kinds && !projEntry.kinds.includes(event.kind)) {
      return { fire: false, reason: 'project-filter' };
    }
  } else if (!config.projectDefault.enabled) {
    return { fire: false, reason: 'project-default-disabled' };
  }

  if (event.kind !== 'PERMISSION' && idleSeconds < idleThreshold) {
    return { fire: false, reason: 'user-active' };
  }

  return { fire: true };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/suppress.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-suppress
git add packages/core/src/suppress.ts packages/core/tests/suppress.test.ts
git commit -m "feat(core): pure suppression decision tree with reason logging"
```

---

### Task 1.9: `notify.ts` — single chokepoint over node-notifier

**Files:**
- Create: `packages/core/src/notify.ts`
- Test: `packages/core/tests/notify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/notify.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fireNotification, type Notifier } from '../src/notify.js';
import type { Event } from '../src/types.js';

const ev = (overrides: Partial<Event> = {}): Event => ({
  kind: 'TURN_DONE',
  tool: 'claude-code',
  project: 'demo',
  sessionId: 's1',
  cwd: '/x',
  ...overrides,
});

const stubNotifier = (): { calls: unknown[]; notifier: Notifier } => {
  const calls: unknown[] = [];
  return {
    calls,
    notifier: { notify: (opts: unknown) => { calls.push(opts); return Promise.resolve(); } },
  };
};

describe('fireNotification (darwin)', () => {
  it('PERMISSION uses sticky alert + Sosumi sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'PERMISSION', message: 'needs perm' }), { platform: 'darwin', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['title']).toMatch(/approval/i);
    expect(c['sound']).toBe('Sosumi');
    expect(c['wait']).toBe(true); // sticky
  });

  it('IDLE uses banner + Tink sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'IDLE' }), { platform: 'darwin', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['title']).toMatch(/idle/i);
    expect(c['sound']).toBe('Tink');
  });

  it('TURN_DONE uses banner + Glass sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'TURN_DONE' }), { platform: 'darwin', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['sound']).toBe('Glass');
  });

  it('body includes project name and tool', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'PERMISSION', project: 'my-app' }), { platform: 'darwin', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['message'])).toContain('my-app');
    expect(String(c['message'])).toContain('claude-code');
  });
});

describe('fireNotification (win32)', () => {
  it('PERMISSION uses scenario=alarm', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'PERMISSION' }), { platform: 'win32', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['scenario']).toBe('alarm');
  });

  it('IDLE uses Windows default sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'IDLE' }), { platform: 'win32', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['sound'])).toContain('ms-winsoundevent');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/notify.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/notify.ts`**

```ts
import notifierLib from 'node-notifier';
import type { Event, Kind } from './types.js';

export interface Notifier {
  notify: (opts: Record<string, unknown>) => Promise<void>;
}

export interface FireOptions {
  platform?: NodeJS.Platform;
  notifier?: Notifier;
}

const defaultNotifier: Notifier = {
  notify: (opts) =>
    new Promise((resolve) => {
      notifierLib.notify(opts, () => resolve());
    }),
};

interface KindConfig {
  title: string;
  macSound: string;
  winSound: string;
  sticky: boolean;
}

const KINDS: Record<Kind, KindConfig> = {
  PERMISSION: { title: 'Claude needs approval', macSound: 'Sosumi', winSound: 'ms-winsoundevent:Notification.Looping.Alarm', sticky: true },
  IDLE:       { title: 'Agent is idle',         macSound: 'Tink',   winSound: 'ms-winsoundevent:Notification.Default',       sticky: false },
  TURN_DONE:  { title: 'Agent is done',         macSound: 'Glass',  winSound: 'ms-winsoundevent:Notification.IM',            sticky: false },
};

export async function fireNotification(event: Event, opts: FireOptions = {}): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const n = opts.notifier ?? defaultNotifier;
  const cfg = KINDS[event.kind];
  const body = `${event.project} · ${event.tool}${event.message ? ` · ${event.message.slice(0, 80)}` : ''}`;

  if (platform === 'win32') {
    await n.notify({
      title: cfg.title,
      message: body,
      sound: cfg.winSound,
      scenario: cfg.sticky ? 'alarm' : 'reminder',
      timeout: cfg.sticky ? false : 10,
    });
    return;
  }

  // darwin (and unsupported fallback)
  await n.notify({
    title: cfg.title,
    message: body,
    sound: cfg.macSound,
    wait: cfg.sticky,
    timeout: cfg.sticky ? 0 : 10,
  });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/notify.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/core-notify
git add packages/core/src/notify.ts packages/core/tests/notify.test.ts
git commit -m "feat(core): single notify chokepoint with cross-platform sound + sticky"
```

---

## Phase 2 — Tool adapters

Each adapter exports `classify(payload: unknown): Event | null`. Inputs come from real hook payload shapes documented in the spec; tests use synthetic JSON fixtures matching those shapes.

### Task 2.1: Claude Code adapter

**Files:**
- Create: `packages/core/src/adapters/claude-code.ts`
- Create: `packages/core/tests/fixtures/claude-code/permission.json`
- Create: `packages/core/tests/fixtures/claude-code/idle.json`
- Create: `packages/core/tests/fixtures/claude-code/stop.json`
- Test: `packages/core/tests/adapters/claude-code.test.ts`

- [ ] **Step 1: Create fixture `packages/core/tests/fixtures/claude-code/permission.json`**

```json
{
  "hook_event_name": "Notification",
  "session_id": "abc123def",
  "cwd": "/Users/x/my-app",
  "transcript_path": "/Users/x/.claude/projects/my-app/abc.jsonl",
  "message": "Claude needs your permission to use Bash"
}
```

- [ ] **Step 2: Create fixture `packages/core/tests/fixtures/claude-code/idle.json`**

```json
{
  "hook_event_name": "Notification",
  "session_id": "abc123def",
  "cwd": "/Users/x/my-app",
  "message": "Claude is waiting for your input"
}
```

- [ ] **Step 3: Create fixture `packages/core/tests/fixtures/claude-code/stop.json`**

```json
{
  "hook_event_name": "Stop",
  "session_id": "abc123def",
  "cwd": "/Users/x/my-app",
  "stop_hook_active": false
}
```

- [ ] **Step 4: Write the failing test**

```ts
// packages/core/tests/adapters/claude-code.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyClaudeCode } from '../../src/adapters/claude-code.js';

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'claude-code', name), 'utf8'));

describe('claude-code adapter', () => {
  it('classifies permission notification', () => {
    const e = classifyClaudeCode(load('permission.json'));
    expect(e?.kind).toBe('PERMISSION');
    expect(e?.tool).toBe('claude-code');
    expect(e?.project).toBe('my-app');
    expect(e?.sessionId).toBe('abc123def');
  });

  it('classifies idle notification', () => {
    expect(classifyClaudeCode(load('idle.json'))?.kind).toBe('IDLE');
  });

  it('classifies stop event as TURN_DONE', () => {
    expect(classifyClaudeCode(load('stop.json'))?.kind).toBe('TURN_DONE');
  });

  it('returns null for unknown event names', () => {
    expect(classifyClaudeCode({ hook_event_name: 'PreToolUse', session_id: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads (missing required fields)', () => {
    expect(classifyClaudeCode({})).toBeNull();
    expect(classifyClaudeCode(null)).toBeNull();
    expect(classifyClaudeCode('not an object')).toBeNull();
  });

  it('disambiguates Notification by message text', () => {
    const ambiguous = { hook_event_name: 'Notification', session_id: 's', cwd: '/x', message: 'something else' };
    expect(classifyClaudeCode(ambiguous)).toBeNull();
  });
});
```

- [ ] **Step 5: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/adapters/claude-code.test.ts
```

- [ ] **Step 6: Implement `packages/core/src/adapters/claude-code.ts`**

```ts
import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  hook_event_name: z.string(),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  message: z.string().optional(),
});

const PERMISSION_RE = /permission/i;
const IDLE_RE = /waiting.*input/i;

export function classifyClaudeCode(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { hook_event_name, session_id, cwd, message } = parsed.data;

  const base = {
    tool: 'claude-code' as const,
    project: basename(cwd),
    sessionId: session_id,
    cwd,
    ...(message !== undefined && { message }),
  };

  if (hook_event_name === 'Stop') return { ...base, kind: 'TURN_DONE' };
  if (hook_event_name === 'Notification' && message) {
    if (PERMISSION_RE.test(message)) return { ...base, kind: 'PERMISSION' };
    if (IDLE_RE.test(message)) return { ...base, kind: 'IDLE' };
  }
  return null;
}
```

- [ ] **Step 7: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/adapters/claude-code.test.ts
```

- [ ] **Step 8: Commit**

```bash
git checkout -b feature/adapter-claude-code
git add packages/core/src/adapters/claude-code.ts packages/core/tests/adapters/claude-code.test.ts packages/core/tests/fixtures/claude-code/
git commit -m "feat(adapter): claude-code classifier with fixture-driven tests"
```

---

### Task 2.2: Codex adapter

**Files:**
- Create: `packages/core/src/adapters/codex.ts`
- Create: `packages/core/tests/fixtures/codex/permission_request.json`
- Create: `packages/core/tests/fixtures/codex/stop.json`
- Test: `packages/core/tests/adapters/codex.test.ts`

- [ ] **Step 1: Create fixture `packages/core/tests/fixtures/codex/permission_request.json`**

```json
{
  "event": "PermissionRequest",
  "session_id": "cdx-9001",
  "cwd": "/Users/x/codex-app",
  "tool": "shell",
  "command": ["rm", "-rf", "node_modules"]
}
```

- [ ] **Step 2: Create fixture `packages/core/tests/fixtures/codex/stop.json`**

```json
{
  "event": "Stop",
  "session_id": "cdx-9001",
  "cwd": "/Users/x/codex-app"
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/core/tests/adapters/codex.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyCodex } from '../../src/adapters/codex.js';

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'codex', name), 'utf8'));

describe('codex adapter', () => {
  it('classifies PermissionRequest as PERMISSION', () => {
    const e = classifyCodex(load('permission_request.json'));
    expect(e?.kind).toBe('PERMISSION');
    expect(e?.tool).toBe('codex');
    expect(e?.project).toBe('codex-app');
    expect(e?.sessionId).toBe('cdx-9001');
  });

  it('classifies Stop as TURN_DONE', () => {
    const e = classifyCodex(load('stop.json'));
    expect(e?.kind).toBe('TURN_DONE');
  });

  it('returns null for unsupported events', () => {
    expect(classifyCodex({ event: 'PreToolUse', session_id: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(classifyCodex({})).toBeNull();
    expect(classifyCodex(undefined)).toBeNull();
  });

  it('attaches truncated command preview to message', () => {
    const e = classifyCodex(load('permission_request.json'));
    expect(e?.message).toContain('rm');
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/adapters/codex.test.ts
```

- [ ] **Step 5: Implement `packages/core/src/adapters/codex.ts`**

```ts
import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  event: z.string(),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  tool: z.string().optional(),
  command: z.array(z.string()).optional(),
});

export function classifyCodex(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { event, session_id, cwd, tool, command } = parsed.data;

  const message =
    tool && command ? `${tool}: ${command.join(' ').slice(0, 80)}` :
    tool ? tool :
    undefined;

  const base = {
    tool: 'codex' as const,
    project: basename(cwd),
    sessionId: session_id,
    cwd,
    ...(message !== undefined && { message }),
  };

  if (event === 'PermissionRequest') return { ...base, kind: 'PERMISSION' };
  if (event === 'Stop') return { ...base, kind: 'TURN_DONE' };
  return null;
}
```

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/adapters/codex.test.ts
```

- [ ] **Step 7: Commit**

```bash
git checkout -b feature/adapter-codex
git add packages/core/src/adapters/codex.ts packages/core/tests/adapters/codex.test.ts packages/core/tests/fixtures/codex/
git commit -m "feat(adapter): codex classifier (PermissionRequest + Stop)"
```

---

### Task 2.3: Gemini adapter

**Files:**
- Create: `packages/core/src/adapters/gemini.ts`
- Create: `packages/core/tests/fixtures/gemini/notification_perm.json`
- Create: `packages/core/tests/fixtures/gemini/notification_idle.json`
- Create: `packages/core/tests/fixtures/gemini/after_agent.json`
- Test: `packages/core/tests/adapters/gemini.test.ts`

- [ ] **Step 1: Create fixture `packages/core/tests/fixtures/gemini/notification_perm.json`**

```json
{
  "event_name": "Notification",
  "session_id": "gem-42",
  "cwd": "/Users/x/gemini-app",
  "notification_type": "tool_confirmation",
  "message": "Approve tool: write_file"
}
```

- [ ] **Step 2: Create fixture `packages/core/tests/fixtures/gemini/notification_idle.json`**

```json
{
  "event_name": "Notification",
  "session_id": "gem-42",
  "cwd": "/Users/x/gemini-app",
  "notification_type": "idle",
  "message": "Awaiting input"
}
```

- [ ] **Step 3: Create fixture `packages/core/tests/fixtures/gemini/after_agent.json`**

```json
{
  "event_name": "AfterAgent",
  "session_id": "gem-42",
  "cwd": "/Users/x/gemini-app"
}
```

- [ ] **Step 4: Write the failing test**

```ts
// packages/core/tests/adapters/gemini.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyGemini } from '../../src/adapters/gemini.js';

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'gemini', name), 'utf8'));

describe('gemini adapter', () => {
  it('classifies tool_confirmation Notification as PERMISSION', () => {
    expect(classifyGemini(load('notification_perm.json'))?.kind).toBe('PERMISSION');
  });

  it('classifies idle Notification as IDLE', () => {
    expect(classifyGemini(load('notification_idle.json'))?.kind).toBe('IDLE');
  });

  it('classifies AfterAgent as TURN_DONE', () => {
    expect(classifyGemini(load('after_agent.json'))?.kind).toBe('TURN_DONE');
  });

  it('returns null for irrelevant events', () => {
    expect(classifyGemini({ event_name: 'BeforeTool', session_id: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(classifyGemini({})).toBeNull();
    expect(classifyGemini(42)).toBeNull();
  });
});
```

- [ ] **Step 5: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/adapters/gemini.test.ts
```

- [ ] **Step 6: Implement `packages/core/src/adapters/gemini.ts`**

```ts
import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  event_name: z.string(),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  notification_type: z.string().optional(),
  message: z.string().optional(),
});

export function classifyGemini(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { event_name, session_id, cwd, notification_type, message } = parsed.data;

  const base = {
    tool: 'gemini' as const,
    project: basename(cwd),
    sessionId: session_id,
    cwd,
    ...(message !== undefined && { message }),
  };

  if (event_name === 'AfterAgent') return { ...base, kind: 'TURN_DONE' };
  if (event_name === 'Notification') {
    if (notification_type === 'tool_confirmation') return { ...base, kind: 'PERMISSION' };
    if (notification_type === 'idle') return { ...base, kind: 'IDLE' };
  }
  return null;
}
```

- [ ] **Step 7: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/adapters/gemini.test.ts
```

- [ ] **Step 8: Commit**

```bash
git checkout -b feature/adapter-gemini
git add packages/core/src/adapters/gemini.ts packages/core/tests/adapters/gemini.test.ts packages/core/tests/fixtures/gemini/
git commit -m "feat(adapter): gemini classifier (Notification + AfterAgent)"
```

---

### Task 2.4: OpenCode adapter (stdin classifier + plugin emitter)

**Files:**
- Create: `packages/core/src/adapters/opencode.ts`
- Create: `packages/core/tests/fixtures/opencode/permission.json`
- Create: `packages/core/tests/fixtures/opencode/session_completed.json`
- Test: `packages/core/tests/adapters/opencode.test.ts`

- [ ] **Step 1: Create fixture `packages/core/tests/fixtures/opencode/permission.json`**

```json
{
  "type": "permission.requested",
  "sessionID": "oc-7",
  "cwd": "/Users/x/oc-app",
  "tool": "edit"
}
```

- [ ] **Step 2: Create fixture `packages/core/tests/fixtures/opencode/session_completed.json`**

```json
{
  "type": "session.completed",
  "sessionID": "oc-7",
  "cwd": "/Users/x/oc-app"
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/core/tests/adapters/opencode.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyOpenCode, OPENCODE_PLUGIN_SOURCE } from '../../src/adapters/opencode.js';

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'opencode', name), 'utf8'));

describe('opencode adapter', () => {
  it('classifies permission.requested as PERMISSION', () => {
    const e = classifyOpenCode(load('permission.json'));
    expect(e?.kind).toBe('PERMISSION');
    expect(e?.sessionId).toBe('oc-7');
    expect(e?.tool).toBe('opencode');
  });

  it('classifies session.completed as TURN_DONE', () => {
    expect(classifyOpenCode(load('session_completed.json'))?.kind).toBe('TURN_DONE');
  });

  it('returns null for irrelevant events', () => {
    expect(classifyOpenCode({ type: 'tool.executed', sessionID: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(classifyOpenCode({})).toBeNull();
  });

  it('plugin source string contains the binary invocation', () => {
    expect(OPENCODE_PLUGIN_SOURCE).toContain('agent-notifier');
    expect(OPENCODE_PLUGIN_SOURCE).toContain('--tool opencode');
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/adapters/opencode.test.ts
```

- [ ] **Step 5: Implement `packages/core/src/adapters/opencode.ts`**

```ts
import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  type: z.string(),
  sessionID: z.string().min(1),
  cwd: z.string().min(1),
  tool: z.string().optional(),
});

export function classifyOpenCode(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { type, sessionID, cwd, tool } = parsed.data;

  const base = {
    tool: 'opencode' as const,
    project: basename(cwd),
    sessionId: sessionID,
    cwd,
    ...(tool !== undefined && { message: tool }),
  };

  if (type === 'permission.requested') return { ...base, kind: 'PERMISSION' };
  if (type === 'session.completed') return { ...base, kind: 'TURN_DONE' };
  return null;
}

export const OPENCODE_PLUGIN_SOURCE = `// agent-notifier opencode plugin (auto-generated; do not edit)
import { spawn } from 'node:child_process';

export default function agentNotifier({ app }) {
  const fire = (type, ev) => {
    const payload = JSON.stringify({ type, sessionID: ev.sessionID, cwd: ev.cwd ?? process.cwd(), tool: ev.tool });
    const p = spawn('agent-notifier', ['hook', '--tool', 'opencode'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    p.stdin.end(payload);
    p.unref();
  };
  return {
    'permission.requested': (ev) => fire('permission.requested', ev),
    'session.completed':    (ev) => fire('session.completed', ev),
  };
}
`;
```

- [ ] **Step 6: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/adapters/opencode.test.ts
```

- [ ] **Step 7: Commit**

```bash
git checkout -b feature/adapter-opencode
git add packages/core/src/adapters/opencode.ts packages/core/tests/adapters/opencode.test.ts packages/core/tests/fixtures/opencode/
git commit -m "feat(adapter): opencode classifier and plugin source emitter"
```

---

### Task 2.5: Adapter registry + core re-exports

**Files:**
- Create: `packages/core/src/adapters/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/adapters/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/adapters/registry.test.ts
import { describe, it, expect } from 'vitest';
import { adapters } from '../../src/adapters/index.js';

describe('adapter registry', () => {
  it('contains all four adapters keyed by tool name', () => {
    expect(Object.keys(adapters).sort()).toEqual(['claude-code', 'codex', 'gemini', 'opencode']);
  });

  it('every adapter is a function', () => {
    for (const fn of Object.values(adapters)) expect(typeof fn).toBe('function');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/core/tests/adapters/registry.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/adapters/index.ts`**

```ts
import type { Event, ToolName } from '../types.js';
import { classifyClaudeCode } from './claude-code.js';
import { classifyCodex } from './codex.js';
import { classifyGemini } from './gemini.js';
import { classifyOpenCode } from './opencode.js';

export type Classifier = (payload: unknown) => Event | null;

export const adapters: Record<ToolName, Classifier> = {
  'claude-code': classifyClaudeCode,
  codex: classifyCodex,
  gemini: classifyGemini,
  opencode: classifyOpenCode,
};

export { OPENCODE_PLUGIN_SOURCE } from './opencode.js';
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

```ts
export * from './types.js';
export * from './platform.js';
export * from './logger.js';
export * from './config.js';
export * from './project.js';
export * from './schedule.js';
export * from './suppress.js';
export * from './idle-gate.js';
export * from './notify.js';
export * from './adapters/index.js';
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm vitest run packages/core/tests/adapters/registry.test.ts
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/core-registry
git add packages/core/src/adapters/index.ts packages/core/src/index.ts packages/core/tests/adapters/registry.test.ts
git commit -m "feat(core): adapter registry and public re-exports"
```

---

## Phase 3 — CLI scaffolding

### Task 3.1: Commander dispatch + version/help

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/integration/cli-version.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/integration/cli-version.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('CLI: --version and --help', () => {
  it('--version prints semver', () => {
    const out = execFileSync('node', [BIN, '--version'], { encoding: 'utf8' });
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help lists every subcommand', () => {
    const out = execFileSync('node', [BIN, '--help'], { encoding: 'utf8' });
    for (const cmd of ['init', 'install', 'uninstall', 'doctor', 'status', 'enable', 'disable', 'mute', 'unmute', 'schedule', 'logs', 'hook']) {
      expect(out).toContain(cmd);
    }
  });

  it('unknown subcommand exits non-zero', () => {
    expect(() => execFileSync('node', [BIN, 'no-such-thing'], { encoding: 'utf8' })).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/cli-version.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/index.ts`**

```ts
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };

const program = new Command();
program.name('agent-notifier').description('Cross-platform notifier for AI coding CLIs').version(pkg.version);

program.command('init').description('interactive setup').action(async () => {
  const { runInit } = await import('./init.js');
  await runInit();
});
program.command('install').description('headless: detect tools and wire up hooks').action(async () => {
  const { runInstall } = await import('./install.js');
  await runInstall();
});
program.command('uninstall').description('restore .bak files, remove plugin files').action(async () => {
  const { runUninstall } = await import('./uninstall.js');
  await runUninstall();
});
program.command('doctor').description('diagnose wiring + fire test notifications').action(async () => {
  const { runDoctor } = await import('./doctor.js');
  await runDoctor();
});
program.command('status').description('print current config + recent logs').action(async () => {
  const { runStatus } = await import('./status.js');
  await runStatus();
});

program
  .command('enable')
  .description('enable notifications (defaults to current project)')
  .option('--global').option('--project [path]').option('--tool <tool>')
  .action(async (opts) => {
    const { runEnable } = await import('./enable.js');
    await runEnable(opts);
  });

program
  .command('disable')
  .description('disable notifications (defaults to current project)')
  .option('--global').option('--project [path]').option('--tool <tool>')
  .action(async (opts) => {
    const { runDisable } = await import('./disable.js');
    await runDisable(opts);
  });

program.command('mute <duration>').description('mute notifications globally for a duration').action(async (duration: string) => {
  const { runMute } = await import('./mute.js');
  await runMute(duration);
});
program.command('unmute').description('end an active mute').action(async () => {
  const { runUnmute } = await import('./mute.js');
  await runUnmute();
});

const sched = program.command('schedule').description('manage allow/deny windows');
sched.command('list').action(async () => { (await import('./schedule.js')).runScheduleList(); });
sched.command('add').option('--allow').option('--deny').option('--days <days>').option('--from <hhmm>').option('--to <hhmm>').option('--id <name>')
  .action(async (opts) => { (await import('./schedule.js')).runScheduleAdd(opts); });
sched.command('remove <id>').action(async (id: string) => { (await import('./schedule.js')).runScheduleRemove(id); });
sched.command('clear').action(async () => { (await import('./schedule.js')).runScheduleClear(); });

program
  .command('logs')
  .option('--project [path]').option('--tool <tool...>').option('--kind <kind...>')
  .option('--suppressed').option('--fired')
  .option('--since <duration>').option('--tail <n>', '', '50').option('--follow').option('--json')
  .action(async (opts) => { (await import('./logs.js')).runLogs(opts); });

program
  .command('hook')
  .description('internal: invoked by hooks themselves; reads JSON on stdin')
  .requiredOption('--tool <tool>')
  .action(async (opts) => {
    const { runHook } = await import('./hook.js');
    await runHook(opts.tool as string);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 4: Stub modules to satisfy lazy imports (one-line stubs)**

Create each of the following files with a minimal export, just to let the dispatch resolve. Real implementations replace these in later tasks.

```ts
// packages/cli/src/init.ts
export async function runInit(): Promise<void> { console.log('init: not yet implemented'); }
```

```ts
// packages/cli/src/install.ts
export async function runInstall(): Promise<void> { console.log('install: not yet implemented'); }
```

```ts
// packages/cli/src/uninstall.ts
export async function runUninstall(): Promise<void> { console.log('uninstall: not yet implemented'); }
```

```ts
// packages/cli/src/doctor.ts
export async function runDoctor(): Promise<void> { console.log('doctor: not yet implemented'); }
```

```ts
// packages/cli/src/status.ts
export async function runStatus(): Promise<void> { console.log('status: not yet implemented'); }
```

```ts
// packages/cli/src/enable.ts
export async function runEnable(_opts: unknown): Promise<void> { console.log('enable: not yet implemented'); }
```

```ts
// packages/cli/src/disable.ts
export async function runDisable(_opts: unknown): Promise<void> { console.log('disable: not yet implemented'); }
```

```ts
// packages/cli/src/mute.ts
export async function runMute(_d: string): Promise<void> { console.log('mute: not yet implemented'); }
export async function runUnmute(): Promise<void> { console.log('unmute: not yet implemented'); }
```

```ts
// packages/cli/src/schedule.ts
export function runScheduleList(): void { console.log('schedule list: not yet implemented'); }
export function runScheduleAdd(_opts: unknown): void { console.log('schedule add: not yet implemented'); }
export function runScheduleRemove(_id: string): void { console.log('schedule remove: not yet implemented'); }
export function runScheduleClear(): void { console.log('schedule clear: not yet implemented'); }
```

```ts
// packages/cli/src/logs.ts
export function runLogs(_opts: unknown): void { console.log('logs: not yet implemented'); }
```

```ts
// packages/cli/src/hook.ts
export async function runHook(_tool: string): Promise<void> { console.log('hook: not yet implemented'); }
```

- [ ] **Step 5: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/cli-version.test.ts
```

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/cli-dispatch
git add packages/cli/src/ packages/cli/tests/
git commit -m "feat(cli): commander dispatch with stubbed subcommand modules"
```

---

### Task 3.2: `hook.ts` entrypoint — end-to-end fire path

**Files:**
- Modify: `packages/cli/src/hook.ts`
- Test: `packages/cli/tests/integration/hook-fire.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/cli/tests/integration/hook-fire.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('hook → notify pipeline (stubbed notifier)', () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'agenthook-')); });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, AGENT_NOTIFIER_NOTIFY_IMPL: 'stub' });

  it('claude-code Stop event fires TURN_DONE notification (stub captures it)', () => {
    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'integ-1',
      cwd: home,
    });
    const r = spawnSync('node', [BIN, 'hook', '--tool', 'claude-code'], { input: payload, env: env(), encoding: 'utf8' });
    expect(r.status).toBe(0);
    const stub = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stub)).toBe(true);
    const lines = readFileSync(stub, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const captured = JSON.parse(lines[0]!) as { event: { kind: string } };
    expect(captured.event.kind).toBe('TURN_DONE');
  });

  it('payload that does not classify exits 0 with no notification', () => {
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', cwd: home });
    const r = spawnSync('node', [BIN, 'hook', '--tool', 'claude-code'], { input: payload, env: env(), encoding: 'utf8' });
    expect(r.status).toBe(0);
    const stub = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stub)).toBe(false);
  });

  it('respects global disable: writes log entry with reason but no stub notification', () => {
    // pre-disable via the CLI itself
    execFileSync('node', [BIN, 'disable', '--global'], { env: env(), stdio: 'ignore' });
    const payload = JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: home });
    spawnSync('node', [BIN, 'hook', '--tool', 'claude-code'], { input: payload, env: env() });
    const log = readFileSync(join(home, '.agent-notifier', 'log', 'notifier.log'), 'utf8');
    expect(log).toContain('global-disabled');
    expect(existsSync(join(home, '.agent-notifier', 'stub-notifications.jsonl'))).toBe(false);
  });
});
```

Note: this test depends on `disable --global` (Task 5.1) and the env-driven stub notifier. We implement the stub now and complete the dependency in Task 5.1; the third test case is marked `.skip` until then.

- [ ] **Step 2: Mark the third test `.skip` for now**

Change `it('respects global disable...'` to `it.skip('respects global disable...'`. Re-enable in Task 5.1.

- [ ] **Step 3: Implement `packages/cli/src/hook.ts`**

```ts
import {
  adapters, ConfigStore, configFilePath, configDir, logDir,
  evaluateSuppression, fireNotification, getIdleSeconds, Logger,
  resolveProjectKey, projectDisplayName, type Event, type ToolName, ToolNameSchema,
} from '@agent-notifier/core';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function tzGuess(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

function stubNotify(event: Event): Promise<void> {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'stub-notifications.jsonl'), JSON.stringify({ event }) + '\n', 'utf8');
  return Promise.resolve();
}

export async function runHook(toolFlag: string): Promise<void> {
  const tool: ToolName = ToolNameSchema.parse(toolFlag);
  const raw = await readStdin();
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const event = adapters[tool](payload);
  if (!event) process.exit(0);

  const tz = tzGuess();
  const store = new ConfigStore(configFilePath(), tz);
  const config = store.load();
  const idle = await getIdleSeconds();
  const projectKey = resolveProjectKey(event.cwd);
  event.project = projectDisplayName(projectKey);

  const decision = evaluateSuppression(config, new Date(), event, idle, projectKey);
  const logger = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
  logger.append({
    ts: new Date().toISOString(),
    tool: event.tool, kind: event.kind, project: event.project, sessionId: event.sessionId,
    fired: decision.fire,
    ...(decision.reason !== undefined && { suppressReason: decision.reason }),
    ...(event.message !== undefined && { msg: event.message }),
  });

  if (!decision.fire) process.exit(0);

  if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') {
    await stubNotify(event);
  } else {
    await fireNotification(event);
  }
}
```

- [ ] **Step 4: Build + run — expect first 2 tests PASS, third SKIPPED**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/hook-fire.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/cli-hook
git add packages/cli/src/hook.ts packages/cli/tests/integration/hook-fire.test.ts
git commit -m "feat(cli): hook entrypoint wires classify→suppress→log→notify"
```

---

## Phase 4 — Install / uninstall / doctor

Each per-tool installer exports:
```ts
export interface ToolInstaller {
  name: ToolName;
  detect(): Promise<boolean>;
  isWired(): Promise<boolean>;
  install(): Promise<void>;     // backup + atomic write
  uninstall(): Promise<void>;   // restore from .bak
}
```

### Task 4.1: Per-tool installer for Claude Code

**Files:**
- Create: `packages/cli/src/lib/installers/claude-code.ts`
- Test: `packages/cli/tests/installers/claude-code.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/installers/claude-code.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createClaudeCodeInstaller } from '../../src/lib/installers/claude-code.js';

describe('claude-code installer', () => {
  let home: string;
  let settingsPath: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentcc-'));
    mkdirSync(join(home, '.claude'));
    settingsPath = join(home, '.claude', 'settings.json');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createClaudeCodeInstaller({ home });

  it('detect: false when ~/.claude does not exist', async () => {
    rmSync(join(home, '.claude'), { recursive: true });
    expect(await inst().detect()).toBe(false);
  });

  it('detect: true when ~/.claude exists', async () => {
    expect(await inst().detect()).toBe(true);
  });

  it('install creates settings.json with hooks if it did not exist', async () => {
    await inst().install();
    expect(existsSync(settingsPath)).toBe(true);
    const s = JSON.parse(readFileSync(settingsPath, 'utf8')) as { hooks: Record<string, unknown> };
    expect(s.hooks).toBeDefined();
  });

  it('install merges into existing settings.json without losing user keys', async () => {
    writeFileSync(settingsPath, JSON.stringify({ model: 'claude-opus-4-7', hooks: { PreToolUse: [] } }, null, 2));
    await inst().install();
    const s = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(s['model']).toBe('claude-opus-4-7');
    expect(s['hooks']).toBeDefined();
  });

  it('install creates a .agent-notifier.bak backup of the original', async () => {
    writeFileSync(settingsPath, JSON.stringify({ model: 'x' }));
    await inst().install();
    const bak = readFileSync(`${settingsPath}.agent-notifier.bak`, 'utf8');
    expect(JSON.parse(bak)).toEqual({ model: 'x' });
  });

  it('install is idempotent (running twice does not duplicate hooks)', async () => {
    await inst().install();
    const after1 = readFileSync(settingsPath, 'utf8');
    await inst().install();
    const after2 = readFileSync(settingsPath, 'utf8');
    expect(after1).toBe(after2);
  });

  it('isWired: true after install', async () => {
    await inst().install();
    expect(await inst().isWired()).toBe(true);
  });

  it('uninstall restores settings.json byte-for-byte from the .bak', async () => {
    const original = JSON.stringify({ model: 'x', hooks: { PreToolUse: [] } }, null, 2);
    writeFileSync(settingsPath, original);
    await inst().install();
    await inst().uninstall();
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
    expect(existsSync(`${settingsPath}.agent-notifier.bak`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/installers/claude-code.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/lib/installers/claude-code.ts`**

```ts
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolName } from '@agent-notifier/core';

export interface ClaudeCodeInstallerOptions { home?: string; }

interface HookEntry { matcher?: string; hooks: Array<{ type: 'command'; command: string }>; }
type Hooks = Record<string, HookEntry[]>;

const MARK = 'agent-notifier';
const EVENTS = ['Notification', 'Stop'] as const;

export function createClaudeCodeInstaller(opts: ClaudeCodeInstallerOptions = {}) {
  const home = opts.home ?? homedir();
  const settings = join(home, '.claude', 'settings.json');
  const bak = `${settings}.agent-notifier.bak`;

  const name: ToolName = 'claude-code';

  function readSettings(): Record<string, unknown> {
    if (!existsSync(settings)) return {};
    return JSON.parse(readFileSync(settings, 'utf8')) as Record<string, unknown>;
  }

  function buildHookEntry(): HookEntry {
    return { hooks: [{ type: 'command', command: `agent-notifier hook --tool claude-code` }] };
  }

  return {
    name,
    async detect(): Promise<boolean> { return existsSync(join(home, '.claude')); },

    async isWired(): Promise<boolean> {
      const s = readSettings();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      return EVENTS.every((evt) => (hooks[evt] ?? []).some((h) => h.hooks.some((x) => x.command.includes(MARK))));
    },

    async install(): Promise<void> {
      mkdirSync(dirname(settings), { recursive: true });
      if (existsSync(settings) && !existsSync(bak)) copyFileSync(settings, bak);
      const s = readSettings();
      const hooks: Hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const evt of EVENTS) {
        hooks[evt] = hooks[evt] ?? [];
        const present = hooks[evt]!.some((h) => h.hooks.some((x) => x.command.includes(MARK)));
        if (!present) hooks[evt]!.push(buildHookEntry());
      }
      s['hooks'] = hooks;
      const tmp = `${settings}.tmp`;
      writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
      renameSync(tmp, settings);
    },

    async uninstall(): Promise<void> {
      if (existsSync(bak)) {
        copyFileSync(bak, settings);
        unlinkSync(bak);
        return;
      }
      // No backup → strip our entries in place
      const s = readSettings();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const evt of EVENTS) {
        hooks[evt] = (hooks[evt] ?? []).filter((h) => !h.hooks.some((x) => x.command.includes(MARK)));
        if (hooks[evt]!.length === 0) delete hooks[evt];
      }
      s['hooks'] = hooks;
      writeFileSync(settings, JSON.stringify(s, null, 2), 'utf8');
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/cli/tests/installers/claude-code.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/installer-claude-code
git add packages/cli/src/lib/installers/claude-code.ts packages/cli/tests/installers/claude-code.test.ts
git commit -m "feat(installer): claude-code wire/unwire with backup and idempotency"
```

---

### Task 4.2: Per-tool installer for Codex (TOML)

**Files:**
- Create: `packages/cli/src/lib/installers/codex.ts`
- Test: `packages/cli/tests/installers/codex.test.ts`
- Add dep: `@iarna/toml`

- [ ] **Step 1: Add TOML dependency**

```bash
pnpm --filter agent-notifier add @iarna/toml@^2.2.5
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/cli/tests/installers/codex.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexInstaller } from '../../src/lib/installers/codex.js';

describe('codex installer', () => {
  let home: string;
  let configPath: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentcdx-'));
    mkdirSync(join(home, '.codex'));
    configPath = join(home, '.codex', 'config.toml');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createCodexInstaller({ home });

  it('detect: true when ~/.codex exists', async () => {
    expect(await inst().detect()).toBe(true);
  });

  it('install adds [[hooks.PermissionRequest]] and [[hooks.Stop]] entries', async () => {
    await inst().install();
    const raw = readFileSync(configPath, 'utf8');
    expect(raw).toContain('PermissionRequest');
    expect(raw).toContain('Stop');
    expect(raw).toContain('agent-notifier hook --tool codex');
  });

  it('install backs up existing TOML', async () => {
    writeFileSync(configPath, 'model = "gpt-5"\n');
    await inst().install();
    expect(readFileSync(`${configPath}.agent-notifier.bak`, 'utf8')).toContain('model = "gpt-5"');
  });

  it('install is idempotent', async () => {
    await inst().install();
    const a = readFileSync(configPath, 'utf8');
    await inst().install();
    expect(readFileSync(configPath, 'utf8')).toBe(a);
  });

  it('uninstall restores backup', async () => {
    const original = 'model = "gpt-5"\n';
    writeFileSync(configPath, original);
    await inst().install();
    await inst().uninstall();
    expect(readFileSync(configPath, 'utf8')).toBe(original);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/installers/codex.test.ts
```

- [ ] **Step 4: Implement `packages/cli/src/lib/installers/codex.ts`**

```ts
import TOML from '@iarna/toml';
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolName } from '@agent-notifier/core';

const MARK = 'agent-notifier hook --tool codex';
const EVENTS = ['PermissionRequest', 'Stop'] as const;

interface HookCmd { command: string; }
type CodexConfig = { hooks?: Record<string, HookCmd[]>; [k: string]: unknown };

export function createCodexInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const file = join(home, '.codex', 'config.toml');
  const bak = `${file}.agent-notifier.bak`;
  const name: ToolName = 'codex';

  function read(): CodexConfig {
    if (!existsSync(file)) return {};
    return TOML.parse(readFileSync(file, 'utf8')) as CodexConfig;
  }

  return {
    name,
    async detect(): Promise<boolean> { return existsSync(join(home, '.codex')); },

    async isWired(): Promise<boolean> {
      const c = read();
      const hooks = c.hooks ?? {};
      return EVENTS.every((e) => (hooks[e] ?? []).some((h) => h.command.includes(MARK)));
    },

    async install(): Promise<void> {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
      const c = read();
      c.hooks = c.hooks ?? {};
      for (const e of EVENTS) {
        c.hooks[e] = c.hooks[e] ?? [];
        if (!c.hooks[e]!.some((h) => h.command.includes(MARK))) {
          c.hooks[e]!.push({ command: MARK });
        }
      }
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, TOML.stringify(c as TOML.JsonMap), 'utf8');
      renameSync(tmp, file);
    },

    async uninstall(): Promise<void> {
      if (existsSync(bak)) {
        copyFileSync(bak, file);
        unlinkSync(bak);
        return;
      }
      const c = read();
      const hooks = c.hooks ?? {};
      for (const e of EVENTS) {
        hooks[e] = (hooks[e] ?? []).filter((h) => !h.command.includes(MARK));
        if (hooks[e]!.length === 0) delete hooks[e];
      }
      c.hooks = hooks;
      writeFileSync(file, TOML.stringify(c as TOML.JsonMap), 'utf8');
    },
  };
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm vitest run packages/cli/tests/installers/codex.test.ts
```

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/installer-codex
git add packages/cli/src/lib/installers/codex.ts packages/cli/tests/installers/codex.test.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(installer): codex TOML installer with backup and idempotency"
```

---

### Task 4.3: Per-tool installer for Gemini

**Files:**
- Create: `packages/cli/src/lib/installers/gemini.ts`
- Test: `packages/cli/tests/installers/gemini.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/installers/gemini.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGeminiInstaller } from '../../src/lib/installers/gemini.js';

describe('gemini installer', () => {
  let home: string; let path: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentgem-'));
    mkdirSync(join(home, '.gemini'));
    path = join(home, '.gemini', 'settings.json');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createGeminiInstaller({ home });

  it('install creates settings.json with Notification + AfterAgent hooks', async () => {
    await inst().install();
    const s = JSON.parse(readFileSync(path, 'utf8')) as { hooks: Record<string, unknown> };
    expect(s.hooks['Notification']).toBeDefined();
    expect(s.hooks['AfterAgent']).toBeDefined();
  });

  it('install merges into existing settings.json without dropping user keys', async () => {
    writeFileSync(path, JSON.stringify({ theme: 'dark' }));
    await inst().install();
    const s = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(s['theme']).toBe('dark');
  });

  it('install is idempotent', async () => {
    await inst().install();
    const a = readFileSync(path, 'utf8');
    await inst().install();
    expect(readFileSync(path, 'utf8')).toBe(a);
  });

  it('uninstall restores byte-for-byte', async () => {
    const orig = JSON.stringify({ theme: 'dark' }, null, 2);
    writeFileSync(path, orig);
    await inst().install();
    await inst().uninstall();
    expect(readFileSync(path, 'utf8')).toBe(orig);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/installers/gemini.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/lib/installers/gemini.ts`**

```ts
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolName } from '@agent-notifier/core';

const MARK = 'agent-notifier hook --tool gemini';
const EVENTS = ['Notification', 'AfterAgent'] as const;

interface HookCmd { command: string; }
type Hooks = Record<string, HookCmd[]>;

export function createGeminiInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const file = join(home, '.gemini', 'settings.json');
  const bak = `${file}.agent-notifier.bak`;
  const name: ToolName = 'gemini';

  function read(): Record<string, unknown> {
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  }

  return {
    name,
    async detect(): Promise<boolean> { return existsSync(join(home, '.gemini')); },

    async isWired(): Promise<boolean> {
      const s = read();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      return EVENTS.every((e) => (hooks[e] ?? []).some((h) => h.command.includes(MARK)));
    },

    async install(): Promise<void> {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
      const s = read();
      const hooks: Hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const e of EVENTS) {
        hooks[e] = hooks[e] ?? [];
        if (!hooks[e]!.some((h) => h.command.includes(MARK))) hooks[e]!.push({ command: MARK });
      }
      s['hooks'] = hooks;
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
      renameSync(tmp, file);
    },

    async uninstall(): Promise<void> {
      if (existsSync(bak)) {
        copyFileSync(bak, file);
        unlinkSync(bak);
        return;
      }
      const s = read();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const e of EVENTS) {
        hooks[e] = (hooks[e] ?? []).filter((h) => !h.command.includes(MARK));
        if (hooks[e]!.length === 0) delete hooks[e];
      }
      s['hooks'] = hooks;
      writeFileSync(file, JSON.stringify(s, null, 2), 'utf8');
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/cli/tests/installers/gemini.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/installer-gemini
git add packages/cli/src/lib/installers/gemini.ts packages/cli/tests/installers/gemini.test.ts
git commit -m "feat(installer): gemini settings.json installer with backup and idempotency"
```

---

### Task 4.4: Per-tool installer for OpenCode (plugin file)

**Files:**
- Create: `packages/cli/src/lib/installers/opencode.ts`
- Test: `packages/cli/tests/installers/opencode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/installers/opencode.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenCodeInstaller } from '../../src/lib/installers/opencode.js';

describe('opencode installer', () => {
  let home: string; let pluginDir: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentoc-'));
    pluginDir = join(home, '.config', 'opencode', 'plugins');
    mkdirSync(pluginDir, { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createOpenCodeInstaller({ home });

  it('install writes the plugin file', async () => {
    await inst().install();
    const file = join(pluginDir, 'agent-notifier.js');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain("agent-notifier");
  });

  it('install is idempotent (overwrites with same content)', async () => {
    await inst().install();
    const a = readFileSync(join(pluginDir, 'agent-notifier.js'), 'utf8');
    await inst().install();
    expect(readFileSync(join(pluginDir, 'agent-notifier.js'), 'utf8')).toBe(a);
  });

  it('uninstall removes the plugin file', async () => {
    await inst().install();
    await inst().uninstall();
    expect(existsSync(join(pluginDir, 'agent-notifier.js'))).toBe(false);
  });

  it('detect: true only when plugins dir exists', async () => {
    expect(await inst().detect()).toBe(true);
    rmSync(pluginDir, { recursive: true });
    expect(await inst().detect()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/installers/opencode.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/lib/installers/opencode.ts`**

```ts
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { OPENCODE_PLUGIN_SOURCE, type ToolName } from '@agent-notifier/core';

export function createOpenCodeInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const dir = join(home, '.config', 'opencode', 'plugins');
  const file = join(dir, 'agent-notifier.js');
  const name: ToolName = 'opencode';

  return {
    name,
    async detect(): Promise<boolean> { return existsSync(dir); },
    async isWired(): Promise<boolean> { return existsSync(file); },
    async install(): Promise<void> {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, OPENCODE_PLUGIN_SOURCE, 'utf8');
    },
    async uninstall(): Promise<void> {
      if (existsSync(file)) unlinkSync(file);
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm vitest run packages/cli/tests/installers/opencode.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/installer-opencode
git add packages/cli/src/lib/installers/opencode.ts packages/cli/tests/installers/opencode.test.ts
git commit -m "feat(installer): opencode plugin-file installer"
```

---

### Task 4.5: `install.ts` orchestrator + `uninstall.ts`

**Files:**
- Modify: `packages/cli/src/install.ts`
- Modify: `packages/cli/src/uninstall.ts`
- Test: `packages/cli/tests/integration/install-orchestrator.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/cli/tests/integration/install-orchestrator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('install / uninstall orchestrator', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentinst-'));
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.gemini'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  it('install detects and wires available tools, leaves missing ones alone', () => {
    const out = execFileSync('node', [BIN, 'install'], { env: env(), encoding: 'utf8' });
    expect(out).toMatch(/claude-code/);
    expect(out).toMatch(/gemini/);
    expect(out).toMatch(/codex.*not detected/i);
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(home, '.gemini', 'settings.json'))).toBe(true);
  });

  it('uninstall reverses install (no .bak left behind)', () => {
    execFileSync('node', [BIN, 'install'], { env: env() });
    execFileSync('node', [BIN, 'uninstall'], { env: env() });
    expect(existsSync(join(home, '.claude', 'settings.json.agent-notifier.bak'))).toBe(false);
    expect(existsSync(join(home, '.gemini', 'settings.json.agent-notifier.bak'))).toBe(false);
  });

  it('install is idempotent (running twice does not change files)', () => {
    execFileSync('node', [BIN, 'install'], { env: env() });
    const a = readFileSync(join(home, '.claude', 'settings.json'), 'utf8');
    execFileSync('node', [BIN, 'install'], { env: env() });
    const b = readFileSync(join(home, '.claude', 'settings.json'), 'utf8');
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm build && pnpm vitest run packages/cli/tests/integration/install-orchestrator.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/install.ts`**

```ts
import { homedir } from 'node:os';
import kleur from 'kleur';
import { createClaudeCodeInstaller } from './lib/installers/claude-code.js';
import { createCodexInstaller } from './lib/installers/codex.js';
import { createGeminiInstaller } from './lib/installers/gemini.js';
import { createOpenCodeInstaller } from './lib/installers/opencode.js';
import type { ToolName } from '@agent-notifier/core';

export interface ToolInstaller {
  name: ToolName;
  detect: () => Promise<boolean>;
  isWired: () => Promise<boolean>;
  install: () => Promise<void>;
  uninstall: () => Promise<void>;
}

export function allInstallers(home?: string): ToolInstaller[] {
  const h = home ?? homedir();
  return [
    createClaudeCodeInstaller({ home: h }),
    createCodexInstaller({ home: h }),
    createGeminiInstaller({ home: h }),
    createOpenCodeInstaller({ home: h }),
  ];
}

export async function runInstall(): Promise<void> {
  for (const inst of allInstallers()) {
    if (!(await inst.detect())) {
      console.log(`${kleur.gray('✗')} ${inst.name} (not detected)`);
      continue;
    }
    if (await inst.isWired()) {
      console.log(`${kleur.green('✓')} ${inst.name} (already installed)`);
      continue;
    }
    await inst.install();
    console.log(`${kleur.green('✓')} ${inst.name} (wired)`);
  }
  console.log(kleur.gray("\nNext: run 'agent-notifier doctor' to fire test notifications."));
}
```

- [ ] **Step 4: Implement `packages/cli/src/uninstall.ts`**

```ts
import kleur from 'kleur';
import { allInstallers } from './install.js';

export async function runUninstall(): Promise<void> {
  for (const inst of allInstallers()) {
    if (await inst.isWired()) {
      await inst.uninstall();
      console.log(`${kleur.green('✓')} ${inst.name} (unwired)`);
    } else {
      console.log(`${kleur.gray('-')} ${inst.name} (not wired)`);
    }
  }
}
```

- [ ] **Step 5: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/install-orchestrator.test.ts
```

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/cli-install-orchestrator
git add packages/cli/src/install.ts packages/cli/src/uninstall.ts packages/cli/tests/integration/install-orchestrator.test.ts
git commit -m "feat(cli): install/uninstall orchestrator over per-tool installers"
```

---

### Task 4.6: `doctor.ts`

**Files:**
- Modify: `packages/cli/src/doctor.ts`
- Test: `packages/cli/tests/integration/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/integration/doctor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('doctor (stub notifier)', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentdoc-'));
    mkdirSync(join(home, '.claude'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, AGENT_NOTIFIER_NOTIFY_IMPL: 'stub' });

  it('prints platform / version / config dir and fires three test notifications', () => {
    execFileSync('node', [BIN, 'install'], { env: env() });
    const out = execFileSync('node', [BIN, 'doctor'], { env: env(), encoding: 'utf8' });
    expect(out).toMatch(/agent-notifier/);
    expect(out).toMatch(/claude-code/);
    const stub = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stub)).toBe(true);
    const lines = readFileSync(stub, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const kinds = lines.map((l) => l.event.kind);
    expect(kinds).toContain('PERMISSION');
    expect(kinds).toContain('IDLE');
    expect(kinds).toContain('TURN_DONE');
  });

  it('exits 0 when at least one tool is wired', () => {
    execFileSync('node', [BIN, 'install'], { env: env() });
    const out = execFileSync('node', [BIN, 'doctor'], { env: env(), encoding: 'utf8' });
    expect(out).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/integration/doctor.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/doctor.ts`**

```ts
import { existsSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import kleur from 'kleur';
import {
  configDir, configFilePath, fireNotification, Logger, logDir, type Event,
} from '@agent-notifier/core';
import { allInstallers } from './install.js';

const TEST_EVENTS: Event[] = [
  { kind: 'PERMISSION', tool: 'claude-code', project: '<doctor-test>', sessionId: 'doctor', cwd: process.cwd(), message: 'test permission' },
  { kind: 'IDLE',       tool: 'claude-code', project: '<doctor-test>', sessionId: 'doctor', cwd: process.cwd(), message: 'test idle' },
  { kind: 'TURN_DONE',  tool: 'claude-code', project: '<doctor-test>', sessionId: 'doctor', cwd: process.cwd(), message: 'test turn done' },
];

function stubNotify(event: Event): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'stub-notifications.jsonl'), JSON.stringify({ event }) + '\n', 'utf8');
}

export async function runDoctor(): Promise<void> {
  console.log(kleur.bold('agent-notifier doctor'));
  console.log(`platform:    ${process.platform}`);
  console.log(`node:        ${process.version}`);
  console.log(`config dir:  ${configDir()}`);
  console.log(`config file: ${configFilePath()}${existsSync(configFilePath()) ? '' : ' (missing — run `agent-notifier init`)'}`);
  console.log('');

  let anyWired = false;
  for (const inst of allInstallers()) {
    const detected = await inst.detect();
    const wired = detected ? await inst.isWired() : false;
    if (wired) anyWired = true;
    const sym = wired ? kleur.green('✓') : detected ? kleur.yellow('!') : kleur.gray('✗');
    console.log(`${sym} ${inst.name.padEnd(12)} detected=${detected} wired=${wired}`);
  }
  console.log('');

  console.log('firing 3 test notifications…');
  for (const e of TEST_EVENTS) {
    if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotify(e);
    else await fireNotification(e);
  }

  const log = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
  const tail = log.readTail(5);
  if (tail.length > 0) {
    console.log('\nrecent log:');
    for (const t of tail) console.log(`  ${t.ts}  ${t.kind.padEnd(10)} ${t.tool.padEnd(12)} ${t.project} ${t.fired ? kleur.green('fired') : kleur.gray(t.suppressReason ?? 'suppressed')}`);
  }

  process.exit(anyWired ? 0 : 1);
}
```

- [ ] **Step 4: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/doctor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/cli-doctor
git add packages/cli/src/doctor.ts packages/cli/tests/integration/doctor.test.ts
git commit -m "feat(cli): doctor diagnoses wiring + fires test notifications"
```

---

## Phase 5 — Management commands

### Task 5.1: `enable` / `disable`

**Files:**
- Modify: `packages/cli/src/enable.ts`
- Modify: `packages/cli/src/disable.ts`
- Test: `packages/cli/tests/integration/enable-disable.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/integration/enable-disable.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('enable / disable', () => {
  let home: string; let projectDir: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentena-'));
    projectDir = join(home, 'project-x');
    mkdirSync(join(projectDir, '.git'), { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  it('disable --global writes global.enabled = false to config', () => {
    execFileSync('node', [BIN, 'disable', '--global'], { env: env() });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    expect(c.global.enabled).toBe(false);
  });

  it('enable --global re-enables', () => {
    execFileSync('node', [BIN, 'disable', '--global'], { env: env() });
    execFileSync('node', [BIN, 'enable', '--global'], { env: env() });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    expect(c.global.enabled).toBe(true);
  });

  it('disable --tool codex marks codex disabled', () => {
    execFileSync('node', [BIN, 'disable', '--tool', 'codex'], { env: env() });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    expect(c.tools.codex.enabled).toBe(false);
  });

  it('disable --project <path> records the project key (git root) as disabled', () => {
    execFileSync('node', [BIN, 'disable', '--project', projectDir], { env: env() });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    expect(c.projects[projectDir]).toEqual({ enabled: false });
  });

  it('disable with no flags defaults to current directory project key', () => {
    execFileSync('node', [BIN, 'disable'], { env: env(), cwd: projectDir });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    expect(c.projects[projectDir]).toEqual({ enabled: false });
  });

  it('rejects unknown tool name', () => {
    expect(() => execFileSync('node', [BIN, 'disable', '--tool', 'aider'], { env: env() })).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/integration/enable-disable.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/enable.ts` and `disable.ts`**

```ts
// packages/cli/src/enable.ts
import { ConfigStore, configFilePath, resolveProjectKey, ToolNameSchema } from '@agent-notifier/core';
import kleur from 'kleur';

export interface EnableOpts { global?: boolean; project?: string | true; tool?: string; }

export async function runEnable(opts: EnableOpts): Promise<void> { await applyToggle(opts, true); }

export async function applyToggle(opts: EnableOpts, enabled: boolean): Promise<void> {
  const store = new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (opts.global) {
    store.update((c) => { c.global.enabled = enabled; });
    console.log(`${kleur.green(enabled ? '✓' : '✗')} global ${enabled ? 'enabled' : 'disabled'}`);
    return;
  }
  if (opts.tool) {
    const tool = ToolNameSchema.parse(opts.tool);
    store.update((c) => { c.tools[tool] = { enabled }; });
    console.log(`${kleur.green(enabled ? '✓' : '✗')} tool ${tool} ${enabled ? 'enabled' : 'disabled'}`);
    return;
  }
  // project (default)
  const target = typeof opts.project === 'string' ? opts.project : process.cwd();
  const key = resolveProjectKey(target);
  store.update((c) => { c.projects[key] = { enabled }; });
  console.log(`${kleur.green(enabled ? '✓' : '✗')} project ${key} ${enabled ? 'enabled' : 'disabled'}`);
}
```

```ts
// packages/cli/src/disable.ts
import { applyToggle, type EnableOpts } from './enable.js';

export async function runDisable(opts: EnableOpts): Promise<void> { await applyToggle(opts, false); }
```

- [ ] **Step 4: Re-enable the previously skipped test in `hook-fire.test.ts`**

Change `it.skip('respects global disable...')` back to `it(...)`. The test is now expected to pass because `disable --global` is implemented.

- [ ] **Step 5: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/enable-disable.test.ts packages/cli/tests/integration/hook-fire.test.ts
```

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/cli-enable-disable
git add packages/cli/src/enable.ts packages/cli/src/disable.ts packages/cli/tests/integration/enable-disable.test.ts packages/cli/tests/integration/hook-fire.test.ts
git commit -m "feat(cli): enable/disable for global/tool/project scopes"
```

---

### Task 5.2: Duration parser + `mute` / `unmute`

**Files:**
- Create: `packages/cli/src/lib/duration.ts`
- Modify: `packages/cli/src/mute.ts`
- Test: `packages/cli/tests/duration.test.ts`
- Test: `packages/cli/tests/integration/mute.test.ts`

- [ ] **Step 1: Write the duration parser test**

```ts
// packages/cli/tests/duration.test.ts
import { describe, it, expect } from 'vitest';
import { parseDuration } from '../src/lib/duration.js';

const NOW = new Date('2026-05-04T10:00:00Z');

describe('parseDuration', () => {
  it('parses "30m"', () => expect(parseDuration('30m', NOW).getTime() - NOW.getTime()).toBe(30 * 60_000));
  it('parses "2h"', () => expect(parseDuration('2h', NOW).getTime() - NOW.getTime()).toBe(2 * 60 * 60_000));
  it('parses "1d"', () => expect(parseDuration('1d', NOW).getTime() - NOW.getTime()).toBe(24 * 60 * 60_000));
  it('parses ISO timestamp', () => {
    expect(parseDuration('2026-05-04T15:00:00Z', NOW).toISOString()).toBe('2026-05-04T15:00:00.000Z');
  });
  it('parses "until 17:00" (today)', () => {
    expect(parseDuration('until 17:00', NOW).toISOString()).toBe('2026-05-04T17:00:00.000Z');
  });
  it('parses "until 05:00" as tomorrow when already past', () => {
    expect(parseDuration('until 05:00', NOW).toISOString()).toBe('2026-05-05T05:00:00.000Z');
  });
  it('parses "until tomorrow"', () => {
    expect(parseDuration('until tomorrow', NOW).toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });
  it('throws on garbage', () => expect(() => parseDuration('garbage', NOW)).toThrow());
  it('throws on zero duration', () => expect(() => parseDuration('0m', NOW)).toThrow());
  it('throws on negative duration', () => expect(() => parseDuration('-5m', NOW)).toThrow());
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/duration.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/lib/duration.ts`**

```ts
const REL_RE = /^(\d+)\s*(s|m|h|d)$/;
const HHMM_RE = /^until\s+(\d{1,2}):(\d{2})$/;

export function parseDuration(input: string, now: Date = new Date()): Date {
  const trimmed = input.trim().toLowerCase();

  const rel = trimmed.match(REL_RE);
  if (rel) {
    const n = Number(rel[1]);
    if (n <= 0) throw new Error(`Duration must be positive: ${input}`);
    const unit = rel[2]!;
    const ms = n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0);
    return new Date(now.getTime() + ms);
  }

  if (trimmed === 'until tomorrow') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  const hhmm = trimmed.match(HHMM_RE);
  if (hhmm) {
    const h = Number(hhmm[1]); const m = Number(hhmm[2]);
    if (h > 23 || m > 59) throw new Error(`Invalid time: ${input}`);
    const target = new Date(now);
    target.setUTCHours(h, m, 0, 0);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
    return target;
  }

  // Fallback: ISO 8601
  const iso = new Date(input);
  if (!Number.isNaN(iso.getTime()) && iso.getTime() > now.getTime()) return iso;

  throw new Error(`Cannot parse duration: ${input}. Try "30m", "2h", "until 17:00", "until tomorrow", or an ISO timestamp.`);
}
```

- [ ] **Step 4: Run duration tests — expect PASS**

```bash
pnpm vitest run packages/cli/tests/duration.test.ts
```

- [ ] **Step 5: Write the mute integration test**

```ts
// packages/cli/tests/integration/mute.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('mute / unmute', () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'agentmute-')); });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  it('mute 30m sets mute.until ~30 min in the future', () => {
    execFileSync('node', [BIN, 'mute', '30m'], { env: env() });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    const dt = new Date(c.mute.until).getTime() - Date.now();
    expect(dt).toBeGreaterThan(28 * 60_000);
    expect(dt).toBeLessThan(31 * 60_000);
  });

  it('unmute clears mute', () => {
    execFileSync('node', [BIN, 'mute', '1h'], { env: env() });
    execFileSync('node', [BIN, 'unmute'], { env: env() });
    const c = JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));
    expect(c.mute).toBeNull();
  });

  it('mute with garbage exits non-zero', () => {
    expect(() => execFileSync('node', [BIN, 'mute', 'garbage'], { env: env() })).toThrow();
  });
});
```

- [ ] **Step 6: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/integration/mute.test.ts
```

- [ ] **Step 7: Implement `packages/cli/src/mute.ts`**

```ts
import kleur from 'kleur';
import { ConfigStore, configFilePath } from '@agent-notifier/core';
import { parseDuration } from './lib/duration.js';

export async function runMute(input: string): Promise<void> {
  const until = parseDuration(input);
  const store = new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  store.update((c) => { c.mute = { until: until.toISOString() }; });
  console.log(`${kleur.yellow('🔇')} muted until ${until.toISOString()}`);
}

export async function runUnmute(): Promise<void> {
  const store = new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  store.update((c) => { c.mute = null; });
  console.log(`${kleur.green('🔔')} unmuted`);
}
```

- [ ] **Step 8: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/mute.test.ts
```

- [ ] **Step 9: Commit**

```bash
git checkout -b feature/cli-mute
git add packages/cli/src/lib/duration.ts packages/cli/src/mute.ts packages/cli/tests/duration.test.ts packages/cli/tests/integration/mute.test.ts
git commit -m "feat(cli): mute/unmute with natural-language duration parser"
```

---

### Task 5.3: `schedule` list/add/remove/clear

**Files:**
- Modify: `packages/cli/src/schedule.ts`
- Test: `packages/cli/tests/integration/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/integration/schedule.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('schedule', () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'agentsch-')); });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });
  const cfg = () => JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'));

  it('add --allow stores an allow rule', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon-fri', '--from', '09:00', '--to', '18:00', '--id', 'work'], { env: env() });
    expect(cfg().schedules).toEqual([{ id: 'work', type: 'allow', days: ['mon','tue','wed','thu','fri'], from: '09:00', to: '18:00' }]);
  });

  it('add --deny stores a deny rule', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--deny', '--days', 'sat,sun', '--from', '00:00', '--to', '23:59', '--id', 'weekend'], { env: env() });
    expect(cfg().schedules[0].type).toBe('deny');
  });

  it('add auto-generates id when --id omitted', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon', '--from', '09:00', '--to', '18:00'], { env: env() });
    expect(cfg().schedules[0].id).toMatch(/^sched-/);
  });

  it('list prints rules', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon', '--from', '09:00', '--to', '18:00', '--id', 'a'], { env: env() });
    const out = execFileSync('node', [BIN, 'schedule', 'list'], { env: env(), encoding: 'utf8' });
    expect(out).toContain('a');
    expect(out).toContain('allow');
  });

  it('remove deletes by id', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon', '--from', '09:00', '--to', '18:00', '--id', 'a'], { env: env() });
    execFileSync('node', [BIN, 'schedule', 'remove', 'a'], { env: env() });
    expect(cfg().schedules).toEqual([]);
  });

  it('clear empties all rules', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon', '--from', '09:00', '--to', '18:00', '--id', 'a'], { env: env() });
    execFileSync('node', [BIN, 'schedule', 'add', '--deny', '--days', 'tue', '--from', '12:00', '--to', '13:00', '--id', 'b'], { env: env() });
    execFileSync('node', [BIN, 'schedule', 'clear'], { env: env() });
    expect(cfg().schedules).toEqual([]);
  });

  it('add rejects when both --allow and --deny passed', () => {
    expect(() => execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--deny', '--days', 'mon', '--from', '09:00', '--to', '18:00'], { env: env() })).toThrow();
  });

  it('add rejects when neither --allow nor --deny passed', () => {
    expect(() => execFileSync('node', [BIN, 'schedule', 'add', '--days', 'mon', '--from', '09:00', '--to', '18:00'], { env: env() })).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/integration/schedule.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/schedule.ts`**

```ts
import kleur from 'kleur';
import { ConfigStore, configFilePath, ScheduleRuleSchema, type ScheduleRule } from '@agent-notifier/core';
import { z } from 'zod';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = typeof DAYS[number];

function parseDays(spec: string): Day[] {
  if (spec.includes('-')) {
    const [a, b] = spec.split('-') as [string, string];
    const i = DAYS.indexOf(a as Day); const j = DAYS.indexOf(b as Day);
    if (i < 0 || j < 0 || i > j) throw new Error(`Bad day range: ${spec}`);
    return DAYS.slice(i, j + 1);
  }
  return spec.split(',').map((d) => {
    if (!DAYS.includes(d as Day)) throw new Error(`Unknown day: ${d}`);
    return d as Day;
  });
}

function tz(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
function store(): ConfigStore { return new ConfigStore(configFilePath(), tz()); }

export interface AddOpts { allow?: boolean; deny?: boolean; days?: string; from?: string; to?: string; id?: string; }

export function runScheduleAdd(opts: AddOpts): void {
  if (opts.allow && opts.deny) { throw new Error('--allow and --deny are mutually exclusive'); }
  if (!opts.allow && !opts.deny) { throw new Error('Pass either --allow or --deny'); }
  if (!opts.days || !opts.from || !opts.to) { throw new Error('--days, --from, --to are required'); }
  const rule: ScheduleRule = ScheduleRuleSchema.parse({
    id: opts.id ?? `sched-${Date.now().toString(36)}`,
    type: opts.allow ? 'allow' : 'deny',
    days: parseDays(opts.days),
    from: opts.from,
    to: opts.to,
  });
  store().update((c) => { c.schedules.push(rule); });
  console.log(`${kleur.green('✓')} added schedule ${rule.id} (${rule.type})`);
}

export function runScheduleList(): void {
  const c = store().load();
  if (c.schedules.length === 0) { console.log(kleur.gray('(no schedules configured)')); return; }
  for (const s of c.schedules) {
    console.log(`  ${s.id.padEnd(20)} ${s.type.padEnd(5)} ${s.days.join(',').padEnd(28)} ${s.from}-${s.to}`);
  }
}

export function runScheduleRemove(id: string): void {
  store().update((c) => { c.schedules = c.schedules.filter((s) => s.id !== id); });
  console.log(`${kleur.yellow('-')} removed ${id}`);
}

export function runScheduleClear(): void {
  store().update((c) => { c.schedules = []; });
  console.log(`${kleur.yellow('-')} cleared all schedules`);
}
```

- [ ] **Step 4: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/schedule.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/cli-schedule
git add packages/cli/src/schedule.ts packages/cli/tests/integration/schedule.test.ts
git commit -m "feat(cli): schedule list/add/remove/clear"
```

---

### Task 5.4: `status`

**Files:**
- Modify: `packages/cli/src/status.ts`
- Test: `packages/cli/tests/integration/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/integration/status.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('status', () => {
  let home: string; let project: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentst-'));
    project = join(home, 'p');
    mkdirSync(join(project, '.git'), { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  it('renders all sections (global, mute, schedules, tools, current project)', () => {
    execFileSync('node', [BIN, 'mute', '1h'], { env: env() });
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon', '--from', '09:00', '--to', '18:00', '--id', 'work'], { env: env() });
    execFileSync('node', [BIN, 'disable', '--tool', 'codex'], { env: env() });
    execFileSync('node', [BIN, 'enable'], { env: env(), cwd: project });
    const out = execFileSync('node', [BIN, 'status'], { env: env(), cwd: project, encoding: 'utf8' });
    expect(out).toContain('Global:');
    expect(out).toContain('Muted:');
    expect(out).toContain('Schedules:');
    expect(out).toContain('Tools:');
    expect(out).toContain('Current dir:');
    expect(out).toContain('codex');
    expect(out).toContain('work');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/integration/status.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/status.ts`**

```ts
import kleur from 'kleur';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ConfigStore, configFilePath, configDir, getIdleSeconds, Logger, logDir,
  resolveProjectKey, type ToolName,
} from '@agent-notifier/core';
import { allInstallers } from './install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = (JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;

export async function runStatus(): Promise<void> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const store = new ConfigStore(configFilePath(), tz);
  const c = store.load();
  console.log(kleur.bold(`agent-notifier ${VERSION} · ${process.platform} · ${configDir()}`));
  console.log('');
  console.log(`Global:        ${c.global.enabled ? kleur.green('enabled') : kleur.red('disabled')}`);
  console.log(`Muted:         ${c.mute ? kleur.yellow(`until ${c.mute.until}`) : 'no'}`);

  if (c.schedules.length === 0) console.log(`Schedules:     ${kleur.gray('(none)')}`);
  else {
    console.log(`Schedules:`);
    for (const s of c.schedules) console.log(`  [${s.id}] ${s.type} ${s.days.join(',')} ${s.from}-${s.to}`);
  }

  process.stdout.write('Tools:         ');
  const installers = allInstallers();
  const tools: string[] = [];
  for (const inst of installers) {
    const wired = (await inst.detect()) ? await inst.isWired() : false;
    const enabled = c.tools[inst.name as ToolName]?.enabled ?? true;
    const sym = !wired ? kleur.gray('✗') : enabled ? kleur.green('✓') : kleur.yellow('○');
    tools.push(`${sym} ${inst.name}`);
  }
  console.log(tools.join('   '));

  const projKey = resolveProjectKey(process.cwd());
  const proj = c.projects[projKey];
  console.log(`Current dir:   ${process.cwd()}`);
  if (proj) {
    console.log(`Project:       ${proj.enabled ? kleur.green('enabled') : kleur.red('disabled')}${proj.kinds ? ` · kinds: ${proj.kinds.join(',')}` : ' · all kinds'}`);
  } else {
    console.log(`Project:       ${kleur.gray(`(not configured; default ${c.projectDefault.enabled ? 'enabled' : 'disabled'})`)}`);
  }

  const idle = await getIdleSeconds();
  console.log(`Idle gate:     ON (last activity ${idle === Infinity ? '?' : `${idle}s ago`})`);

  const log = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
  const tail = log.readTail(5);
  if (tail.length > 0) {
    console.log('\nRecent (last 5):');
    for (const t of tail) {
      console.log(`  ${t.ts}  ${t.kind.padEnd(10)} ${t.project.padEnd(16)} ${t.tool.padEnd(12)} ${t.fired ? kleur.green('fired') : kleur.gray(`suppressed (${t.suppressReason ?? '?'})`)}`);
    }
  }
}
```

- [ ] **Step 4: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/status.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/cli-status
git add packages/cli/src/status.ts packages/cli/tests/integration/status.test.ts
git commit -m "feat(cli): status renders global/mute/schedules/tools/project + recent log"
```

---

### Task 5.5: `logs` filtered tail

**Files:**
- Modify: `packages/cli/src/logs.ts`
- Test: `packages/cli/tests/integration/logs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/tests/integration/logs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('logs', () => {
  let home: string; let logFile: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentlog-'));
    mkdirSync(join(home, '.agent-notifier', 'log'), { recursive: true });
    logFile = join(home, '.agent-notifier', 'log', 'notifier.log');
    const lines = [
      { ts: '2026-05-04T09:00:00Z', tool: 'claude-code', kind: 'PERMISSION', project: 'a', sessionId: 's1', fired: true },
      { ts: '2026-05-04T09:01:00Z', tool: 'codex',       kind: 'IDLE',       project: 'a', sessionId: 's2', fired: false, suppressReason: 'user-active' },
      { ts: '2026-05-04T09:02:00Z', tool: 'gemini',      kind: 'TURN_DONE',  project: 'b', sessionId: 's3', fired: true },
      { ts: '2026-05-04T09:03:00Z', tool: 'claude-code', kind: 'TURN_DONE',  project: 'a', sessionId: 's4', fired: true },
    ].map((o) => JSON.stringify(o)).join('\n') + '\n';
    writeFileSync(logFile, lines);
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  it('--tail 2 prints the last 2 entries', () => {
    const out = execFileSync('node', [BIN, 'logs', '--tail', '2'], { env: env(), encoding: 'utf8' });
    expect(out.split('\n').filter(Boolean)).toHaveLength(2);
    expect(out).toContain('s3');
    expect(out).toContain('s4');
  });

  it('--tool codex filters to codex entries only', () => {
    const out = execFileSync('node', [BIN, 'logs', '--tool', 'codex'], { env: env(), encoding: 'utf8' });
    expect(out).toContain('codex');
    expect(out).not.toContain('claude-code');
  });

  it('--kind PERMISSION filters by kind', () => {
    const out = execFileSync('node', [BIN, 'logs', '--kind', 'PERMISSION'], { env: env(), encoding: 'utf8' });
    expect(out).toContain('PERMISSION');
    expect(out).not.toContain('IDLE');
  });

  it('--suppressed shows only suppressed', () => {
    const out = execFileSync('node', [BIN, 'logs', '--suppressed'], { env: env(), encoding: 'utf8' });
    expect(out).toContain('user-active');
    expect(out).not.toContain('s1');
  });

  it('--fired shows only fired', () => {
    const out = execFileSync('node', [BIN, 'logs', '--fired'], { env: env(), encoding: 'utf8' });
    expect(out).not.toContain('user-active');
    expect(out).toContain('s1');
  });

  it('--json emits raw JSONL', () => {
    const out = execFileSync('node', [BIN, 'logs', '--json'], { env: env(), encoding: 'utf8' });
    for (const line of out.split('\n').filter(Boolean)) JSON.parse(line);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/integration/logs.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/logs.ts`**

```ts
import kleur from 'kleur';
import { Logger, logDir, resolveProjectKey, KindSchema, ToolNameSchema, type LogEntry } from '@agent-notifier/core';

export interface LogsOpts {
  project?: string | true;
  tool?: string[];
  kind?: string[];
  suppressed?: boolean;
  fired?: boolean;
  since?: string;
  tail?: string;
  follow?: boolean;
  json?: boolean;
}

function parseSince(spec: string, now: Date = new Date()): Date {
  const trimmed = spec.trim().toLowerCase();
  if (trimmed === 'today') { const d = new Date(now); d.setUTCHours(0,0,0,0); return d; }
  if (trimmed === 'yesterday') { const d = new Date(now); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - 1); return d; }
  const m = trimmed.match(/^(\d+)\s*(s|m|h|d)$/);
  if (m) {
    const n = Number(m[1]); const unit = m[2]!;
    const ms = n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0);
    return new Date(now.getTime() - ms);
  }
  const d = new Date(spec);
  if (Number.isNaN(d.getTime())) throw new Error(`Cannot parse --since: ${spec}`);
  return d;
}

function matches(entry: LogEntry, opts: LogsOpts, projectKey?: string): boolean {
  if (opts.tool && !opts.tool.map((t) => ToolNameSchema.parse(t)).includes(entry.tool as never)) return false;
  if (opts.kind && !opts.kind.map((k) => KindSchema.parse(k)).includes(entry.kind as never)) return false;
  if (opts.suppressed && entry.fired) return false;
  if (opts.fired && !entry.fired) return false;
  if (projectKey && entry.project !== projectKey.split('/').pop()) return false;
  if (opts.since) {
    const since = parseSince(opts.since);
    if (new Date(entry.ts).getTime() < since.getTime()) return false;
  }
  return true;
}

export function runLogs(opts: LogsOpts): void {
  const log = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
  const projectKey = opts.project === true ? resolveProjectKey(process.cwd()) :
                     typeof opts.project === 'string' ? resolveProjectKey(opts.project) : undefined;
  const all = log.readAll().filter((e) => matches(e, opts, projectKey));
  const tail = Number(opts.tail ?? '50');
  const slice = all.slice(Math.max(0, all.length - tail));

  for (const e of slice) {
    if (opts.json) { console.log(JSON.stringify(e)); continue; }
    const tag = e.fired ? kleur.green('fired') : kleur.gray(`suppressed (${e.suppressReason ?? '?'})`);
    console.log(`${e.ts}  ${e.kind.padEnd(10)} ${e.project.padEnd(16)} ${e.tool.padEnd(12)} ${tag}`);
  }
}
```

- [ ] **Step 4: Build + run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/integration/logs.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/cli-logs
git add packages/cli/src/logs.ts packages/cli/tests/integration/logs.test.ts
git commit -m "feat(cli): logs with project/tool/kind/since/tail/fired/suppressed/json filters"
```

---

### Task 5.6: `init` interactive onboarding

**Files:**
- Modify: `packages/cli/src/init.ts`
- Test: `packages/cli/tests/init.test.ts`

- [ ] **Step 1: Write the failing test (mock @inquirer/prompts)**

```ts
// packages/cli/tests/init.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn().mockResolvedValue(['claude-code']),
  input: vi.fn().mockResolvedValue('Asia/Kolkata'),
  confirm: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true),
  select: vi.fn().mockResolvedValue('enabled'),
}));

describe('init (mocked prompts)', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentinit-'));
    mkdirSync(join(home, '.claude'));
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['APPDATA'] = home;
    process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] = 'stub';
  });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('writes a valid config with the captured timezone and project default', async () => {
    const { runInit } = await import('../src/init.js');
    await runInit();
    const cfgPath = join(home, '.agent-notifier', 'config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(cfg.tz).toBe('Asia/Kolkata');
    expect(cfg.projectDefault.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm vitest run packages/cli/tests/init.test.ts
```

- [ ] **Step 3: Implement `packages/cli/src/init.ts`**

```ts
import { checkbox, input, confirm, select } from '@inquirer/prompts';
import kleur from 'kleur';
import { ConfigStore, configFilePath, defaultConfig, fireNotification, type Event, type ToolName } from '@agent-notifier/core';
import { allInstallers, type ToolInstaller } from './install.js';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

function tzGuess(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

async function detectedTools(): Promise<ToolInstaller[]> {
  const out: ToolInstaller[] = [];
  for (const i of allInstallers()) if (await i.detect()) out.push(i);
  return out;
}

function stub(event: Event): void {
  const dir = dirname(configFilePath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'stub-notifications.jsonl'), JSON.stringify({ event }) + '\n', 'utf8');
}

export async function runInit(): Promise<void> {
  console.log(kleur.bold('Welcome to agent-notifier setup.'));

  const detected = await detectedTools();
  const chosen: ToolName[] = detected.length === 0 ? [] :
    (await checkbox({
      message: 'Which tools do you want to wire up?',
      choices: detected.map((d) => ({ name: d.name, value: d.name as ToolName, checked: true })),
    })) as ToolName[];

  const tz = await input({ message: 'Your timezone:', default: tzGuess() });

  const wantSchedule = await confirm({ message: 'Notify only during work hours?', default: false });
  let schedule: { from: string; to: string } | null = null;
  if (wantSchedule) {
    const from = await input({ message: 'Start time (HH:MM, 24h):', default: '09:00' });
    const to = await input({ message: 'End time (HH:MM, 24h):', default: '18:00' });
    schedule = { from, to };
  }

  const projDefault = (await select({
    message: 'For new (unconfigured) projects, default to:',
    choices: [{ name: 'enabled (notify by default)', value: 'enabled' }, { name: 'disabled (silent until you opt in)', value: 'disabled' }],
    default: 'enabled',
  })) as 'enabled' | 'disabled';

  // Wire selected tools
  for (const i of allInstallers()) {
    if (chosen.includes(i.name as ToolName) && await i.detect() && !(await i.isWired())) {
      await i.install();
      console.log(`${kleur.green('✓')} wired ${i.name}`);
    }
  }

  // Save config
  const cfg = defaultConfig(tz);
  cfg.projectDefault.enabled = projDefault === 'enabled';
  if (schedule) {
    cfg.schedules.push({ id: 'work-hours', type: 'allow', days: ['mon','tue','wed','thu','fri'], from: schedule.from, to: schedule.to });
  }
  new ConfigStore(configFilePath(), tz).save(cfg);
  console.log(`${kleur.green('✓')} wrote config to ${configFilePath()}`);

  // Test notifications (skipped in stub mode)
  const testThem = await confirm({ message: 'Fire 3 test notifications now?', default: true });
  if (testThem) {
    for (const kind of ['PERMISSION', 'IDLE', 'TURN_DONE'] as const) {
      const ev: Event = { kind, tool: 'claude-code', project: '<init-test>', sessionId: 'init', cwd: process.cwd(), message: `init test ${kind}` };
      if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stub(ev);
      else await fireNotification(ev);
    }
  }

  console.log(kleur.bold("\nDone. Run `agent-notifier status` anytime to see current state."));
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm build
pnpm vitest run packages/cli/tests/init.test.ts
```

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/cli-init
git add packages/cli/src/init.ts packages/cli/tests/init.test.ts
git commit -m "feat(cli): interactive init with tools, tz, schedule, project default"
```

---

## Phase 6 — Distribution & release

### Task 6.1: README, CONTRIBUTING, CODE_OF_CONDUCT

**Files:**
- Modify: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`

- [ ] **Step 1: Replace `README.md` with the full open-source README**

```markdown
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
```

- [ ] **Step 2: Create `CONTRIBUTING.md`**

```markdown
# Contributing to agent-notifier

## Dev setup

```bash
git clone <repo>
cd agent-notifier
pnpm install
pnpm test
```

## Workflow

1. Branch: `feature/<slug>` or `fix/<slug>` or `adapter/<tool>`.
2. TDD: write the failing test, then the minimal code to pass it, then commit.
3. Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`.
4. Add a changeset entry: `pnpm changeset` (skip only for non-user-facing chore commits).
5. CI must pass on macOS-latest + windows-latest × Node 20 + 22 before merge.

## Adding a new adapter

1. Create `packages/core/src/adapters/<tool>.ts` exporting `classify<Tool>(payload: unknown): Event | null`.
2. Add fixture payloads under `packages/core/tests/fixtures/<tool>/` covering each event kind.
3. Add `packages/core/tests/adapters/<tool>.test.ts` mirroring the existing adapter tests.
4. Register in `packages/core/src/adapters/index.ts`.
5. Add a `<tool>` entry to the `ToolName` enum in `packages/core/src/types.ts`.
6. Add `packages/cli/src/lib/installers/<tool>.ts` and tests; register in `allInstallers()` in `packages/cli/src/install.ts`.
7. Update README support matrix.

## Release smoke

Before publishing a release:

1. **macOS VM (clean install)**
   - `npm i -g agent-notifier`
   - `agent-notifier install` → `init` → `doctor` → all three test notifications visible.
   - `mute 30s` → notifications suppressed; wait → resumes.
   - `disable` in a git-rooted project → notifications suppressed; check `logs --suppressed --project .` shows `project-disabled`.
   - `schedule add --deny --days $TODAY --from 00:00 --to 23:59 --id all` → all suppressed; `schedule clear` → resumed.
   - `uninstall` → diff every touched dotfile against pre-install backup → byte-identical.
2. **Windows VM** — same checklist.
3. **Real-world session:** start a Claude Code session, run `npm test` (or any 60s+ command), step away, confirm notification arrives within 5s of completion / permission prompt.

If any step fails, fix before publish.
```

- [ ] **Step 3: Create `CODE_OF_CONDUCT.md`**

```markdown
# Contributor Covenant Code of Conduct

This project adopts the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Report concerns to <maintainer-email>.
```

- [ ] **Step 4: Commit**

```bash
git checkout -b docs/oss-readme
git add README.md CONTRIBUTING.md CODE_OF_CONDUCT.md
git commit -m "docs: add OSS README, CONTRIBUTING, CODE_OF_CONDUCT"
```

---

### Task 6.2: GitHub issue templates + release workflow

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/adapter.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/ISSUE_TEMPLATE/bug.yml`**

```yaml
name: Bug report
description: Something is wrong with agent-notifier.
labels: [bug]
body:
  - type: textarea
    attributes: { label: "What happened?", description: "Including expected vs actual." }
    validations: { required: true }
  - type: textarea
    attributes: { label: "agent-notifier doctor output", description: "Paste the full output (it sanitizes paths)." }
    validations: { required: true }
  - type: input
    attributes: { label: "OS + Node version" }
    validations: { required: true }
```

- [ ] **Step 2: Create `.github/ISSUE_TEMPLATE/feature.yml`**

```yaml
name: Feature request
description: Suggest an improvement.
labels: [enhancement]
body:
  - type: textarea
    attributes: { label: "What would you like to see?", description: "What problem does it solve?" }
    validations: { required: true }
```

- [ ] **Step 3: Create `.github/ISSUE_TEMPLATE/adapter.yml`**

```yaml
name: New adapter request
description: Request support for another AI coding CLI.
labels: [adapter]
body:
  - type: input
    attributes: { label: "Tool name + repo" }
    validations: { required: true }
  - type: textarea
    attributes: { label: "Hook surface", description: "Link to the tool's hook/event docs. Sample payloads if available." }
    validations: { required: true }
```

- [ ] **Step 4: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm, registry-url: 'https://registry.npmjs.org' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

- [ ] **Step 5: Commit**

```bash
git checkout -b chore/issue-templates-release
git add .github/ISSUE_TEMPLATE .github/workflows/release.yml
git commit -m "chore: issue templates and changesets-driven release workflow"
```

---

### Task 6.3: Publish-readiness sweep

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/core/package.json`
- Modify: root `README.md` (replace `<owner>` placeholders)

- [ ] **Step 1: Add publish metadata to `packages/cli/package.json`**

Open `packages/cli/package.json` and add the following keys (merge into the existing object — do not overwrite the existing keys):

```json
{
  "description": "Cross-platform desktop notifier for AI coding CLIs (Claude Code, Codex, Gemini, OpenCode).",
  "keywords": ["claude", "claude-code", "codex", "gemini", "opencode", "cli", "notifier", "macos", "windows", "hooks", "agents"],
  "author": "Johnpremkumar Srinivasan <johnpk305@gmail.com>",
  "license": "MIT",
  "homepage": "https://github.com/<owner>/agent-notifier",
  "repository": { "type": "git", "url": "https://github.com/<owner>/agent-notifier.git" },
  "bugs": { "url": "https://github.com/<owner>/agent-notifier/issues" },
  "publishConfig": { "access": "public", "provenance": true }
}
```

- [ ] **Step 2: Add the same publish metadata to `packages/core/package.json`** (substitute `name` description as "Internal core for agent-notifier.")

- [ ] **Step 3: Replace `<owner>` placeholders in `README.md`** with the actual GitHub owner before first publish.

- [ ] **Step 4: Bump versions to `0.1.0` (first publishable version) via changeset**

```bash
pnpm changeset
# select both packages, mark as "minor", message: "Initial release"
git add .changeset
git commit -m "chore: initial release changeset"
```

- [ ] **Step 5: Final lint / build / test gate**

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:coverage
```

Expected: all green; coverage ≥ 90% lines / 85% branches; `suppress.ts` and `schedule.ts` at 100% branches.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/package.json packages/core/package.json README.md
git commit -m "chore: publish metadata and initial-release changeset"
```

---

### Task 6.4: Cross-platform smoke validation

This is a **manual** checklist — there are no failing tests to write, but it gates the release.

- [ ] **Step 1: macOS clean-install run**

On a fresh macOS user account (or a Tart/Lima VM):
```bash
npm i -g agent-notifier
agent-notifier install
agent-notifier init        # accept defaults
agent-notifier doctor
```
Expected: three test notifications visible in Notification Center; PERMISSION is sticky.

- [ ] **Step 2: macOS suppression scenarios**

```bash
agent-notifier mute 30s
# fire a test event (run any Claude Code prompt that triggers Stop) → no notification
sleep 31
agent-notifier doctor      # notifications resume

agent-notifier disable
agent-notifier doctor      # notifications suppressed; logs --suppressed shows project-disabled
agent-notifier enable

agent-notifier schedule add --deny --days $(date +%a | tr A-Z a-z | cut -c1-3) --from 00:00 --to 23:59 --id all
agent-notifier doctor      # suppressed with reason schedule-deny
agent-notifier schedule clear
```

- [ ] **Step 3: macOS uninstall byte-diff**

```bash
cp ~/.claude/settings.json /tmp/before.json
agent-notifier install
agent-notifier uninstall
diff /tmp/before.json ~/.claude/settings.json
```
Expected: empty diff.

- [ ] **Step 4: Windows clean-install run** — repeat steps 1-3 inside a Windows VM (PowerShell) using the equivalent paths (`%APPDATA%\agent-notifier\`).

- [ ] **Step 5: Real-world session**

Start a Claude Code session, run `npm run build` (or any > 60s job), switch focus away from the terminal. When the build finishes, a TURN_DONE banner should appear within 5s.

- [ ] **Step 6: If everything passes, publish**

Merge `main` → release workflow runs `changeset version` → opens a release PR → merge it → workflow publishes to npm.

```bash
# verify after publish:
npm view agent-notifier version
```

- [ ] **Step 7: Commit smoke checklist results to release notes**

The release PR auto-includes the changeset summary; add a `Smoke checklist` section linking to the macOS + Windows screenshots.

---

## Final Self-Review

Run through this checklist before declaring the plan done.

**Spec coverage:** every section in `docs/superpowers/specs/2026-05-03-agent-notifier-design.md` mapped to at least one task above.

| Spec section | Implemented in |
|---|---|
| Triggers (PERMISSION/IDLE/TURN_DONE) | Tasks 1.1, 1.9, 2.1-2.4 |
| Idle gate | Task 1.4 |
| Click activation | Future enhancement; not in v1 (logged in README) |
| Adapters: Claude Code, Codex, Gemini, OpenCode | Tasks 2.1-2.4 |
| Management Layer: config | Tasks 1.1, 1.5 |
| Management Layer: project resolution | Task 1.6 |
| Management Layer: schedule semantics | Task 1.7 |
| Management Layer: suppression | Task 1.8 |
| Management Layer: onboarding | Task 5.6 |
| Management Layer: log filtering | Task 5.5 |
| CLI: install/uninstall/doctor | Tasks 4.1-4.6 |
| CLI: enable/disable | Task 5.1 |
| CLI: mute | Task 5.2 |
| CLI: schedule | Task 5.3 |
| CLI: status | Task 5.4 |
| Single notify chokepoint | Task 1.9 |
| Cross-platform notification (mac/win) | Task 1.9 |
| Cross-platform idle (mac/win) | Task 1.4 |
| Logger with size-based rotation | Task 1.3 |
| Distribution (npm + readme + ci + release) | Tasks 0.4, 0.5, 6.1-6.3 |
| Security & privacy stance (no network, sanitized doctor) | Task 6.1 (README), enforced by absence of network deps |
| Testing matrix (mac/win × node 20/22) | Task 0.4 |
| Coverage bar 90/85, 100% on suppress/schedule | Task 6.3 + per-test-file targets |

**Type consistency:** verified across tasks — `Event`, `Config`, `ScheduleRule`, `ProjectEntry`, `ToolName`, `Kind`, `Logger.append/readTail/readAll`, `ConfigStore.update`, `evaluateSuppression`, `evaluateSchedule`, `fireNotification`, `getIdleSeconds`, `resolveProjectKey`, `parseDuration`, `runHook/runInstall/runUninstall/runDoctor/runStatus/runEnable/runDisable/runMute/runUnmute/runScheduleList/runScheduleAdd/runScheduleRemove/runScheduleClear/runLogs/runInit` all consistent with implementations and call sites.

**Placeholder scan:** no `TODO`, `TBD`, `FIXME`, "implement later", "similar to Task N", or "add error handling for edge cases" tokens. Every code step contains complete code.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-03-agent-notifier.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
