#!/usr/bin/env node
// Local smoke test for agent-notifier. Exercises the published-tarball shape
// AND the actual CLI binary end-to-end against a temp HOME. NOT for CI —
// fires real desktop notifications.
//
// Run: pnpm test:smoke

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const BIN = resolve(REPO, 'packages/cli/bin/agent-notifier.js');

let stepNum = 0;
function step(label) {
  stepNum += 1;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Step ${stepNum}: ${label}`);
  console.log('─'.repeat(60));
}

function fail(msg) {
  console.error(`\n✗ FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────
// Step 1: Build (so the binary + tarball reflect HEAD)
// ─────────────────────────────────────────────────────────────────────
step('Build all packages');
execSync('pnpm -r build', { cwd: REPO, stdio: 'inherit' });
ok('build succeeded');

// ─────────────────────────────────────────────────────────────────────
// Step 2: Tarball asserts — bundled icons must ship in @agent-notifier/core
// ─────────────────────────────────────────────────────────────────────
step('Verify @agent-notifier/core tarball includes bundled icons');
const dryRun = execSync('npm pack --dry-run --json', {
  cwd: join(REPO, 'packages/core'),
  encoding: 'utf8',
});
const files = JSON.parse(dryRun)[0].files.map((f) => f.path);
// npm pack --dry-run --json returns paths without the `package/` prefix that
// appears after unpacking — the paths here are relative to the package root.
const required = ['assets/icon.png', 'assets/icon.icns', 'assets/icon.ico'];
for (const r of required) {
  if (!files.includes(r)) fail(`tarball missing ${r}`);
  ok(`tarball includes ${r}`);
}

// ─────────────────────────────────────────────────────────────────────
// Set up isolated HOME for the rest of the smoke
// ─────────────────────────────────────────────────────────────────────
const home = mkdtempSync(join(tmpdir(), 'agent-notifier-smoke-'));
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: home,
  AGENT_NOTIFIER_NOTIFY_IMPL: 'stub', // capture notifications instead of firing
};
console.log(`\nUsing temp HOME: ${home}`);

function runCli(args, opts = {}) {
  const r = spawnSync('node', [BIN, ...args], {
    env,
    encoding: 'utf8',
    timeout: 10000,
    ...opts,
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    fail(`CLI exited ${r.status} for: ${args.join(' ')}`);
  }
  return r;
}

try {
  // ───────────────────────────────────────────────────────────────────
  // Step 3: Non-interactive init (--tools=claude-code --no-test)
  // ───────────────────────────────────────────────────────────────────
  step('agent-notifier init --tools=claude-code --no-test');
  runCli(['init', '--tools=claude-code', '--no-test']);
  if (!existsSync(join(home, '.agent-notifier', 'config.json'))) {
    fail('config.json was not created by init');
  }
  ok('config.json created');

  // ───────────────────────────────────────────────────────────────────
  // Step 4: Re-init no-diff (idempotent)
  // ───────────────────────────────────────────────────────────────────
  step('Re-init: agent-notifier init --tools=claude-code --no-test (idempotent)');
  const before = readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8');
  runCli(['init', '--tools=claude-code', '--no-test']);
  const after = readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8');
  // Note: re-init may write a backup with a timestamp suffix, but the live
  // config.json content should be unchanged when no flags differ.
  if (before !== after) fail('config.json changed on no-op re-init');
  ok('re-init was a no-op');

  // ───────────────────────────────────────────────────────────────────
  // Step 5: project set --kinds=PERMISSION --enabled=true
  // ───────────────────────────────────────────────────────────────────
  step('agent-notifier project set --kinds=PERMISSION --enabled=true');
  runCli(['project', 'set', '--kinds=PERMISSION', '--enabled=true']);
  ok('project set succeeded');

  // ───────────────────────────────────────────────────────────────────
  // Step 6: project show --json must reflect the new entry
  // ───────────────────────────────────────────────────────────────────
  step('agent-notifier project show --json');
  const showOut = runCli(['project', 'show', '--json']).stdout;
  const showed = JSON.parse(showOut);
  if (!showed.entry) fail(`project show: no entry in output: ${showOut}`);
  if (!Array.isArray(showed.entry.kinds) || !showed.entry.kinds.includes('PERMISSION')) {
    fail(`project show: entry.kinds doesn't include PERMISSION: ${JSON.stringify(showed.entry)}`);
  }
  if (showed.entry.enabled !== true) {
    fail(`project show: entry.enabled !== true: ${JSON.stringify(showed.entry)}`);
  }
  ok('project show reflects the set');

  // ───────────────────────────────────────────────────────────────────
  // Step 7: status --json sanity
  // ───────────────────────────────────────────────────────────────────
  step('agent-notifier status --json');
  const statusOut = runCli(['status', '--json']).stdout;
  const status = JSON.parse(statusOut);
  for (const k of [
    'version',
    'platform',
    'configDir',
    'globalEnabled',
    'tools',
    'currentProject',
    'idleGate',
  ]) {
    if (!(k in status)) fail(`status --json missing key: ${k}`);
  }
  ok('status --json shape valid');

  // ───────────────────────────────────────────────────────────────────
  // Step 8: reset --yes
  // ───────────────────────────────────────────────────────────────────
  step('agent-notifier reset --yes');
  runCli(['reset', '--yes']);
  if (existsSync(join(home, '.agent-notifier', 'config.json'))) {
    fail('config.json should be deleted by reset --yes');
  }
  ok('config.json removed by reset');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('All smoke steps passed.');
  console.log('═'.repeat(60));
} finally {
  rmSync(home, { recursive: true, force: true });
}
