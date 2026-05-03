import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
