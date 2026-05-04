import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', 'bin', 'agent-notifier.js');

describe('bare command + universal flags', () => {
  it('--help works and includes top-level usage', () => {
    const r = spawnSync('node', [BIN, '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage: agent-notifier');
  });

  it('--help lists the universal flags', () => {
    const r = spawnSync('node', [BIN, '--help'], { encoding: 'utf8' });
    expect(r.stdout).toContain('--quiet');
    expect(r.stdout).toContain('--json');
    expect(r.stdout).toContain('--no-color');
    expect(r.stdout).toContain('--debug');
  });

  it('--help lists the new subcommands (reset, project)', () => {
    const r = spawnSync('node', [BIN, '--help'], { encoding: 'utf8' });
    expect(r.stdout).toContain('reset');
    expect(r.stdout).toContain('project');
  });

  it('reset --help works and shows --yes flag', () => {
    const r = spawnSync('node', [BIN, 'reset', '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--yes');
  });

  it('project --help works and lists subcommands', () => {
    const r = spawnSync('node', [BIN, 'project', '--help'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('show');
    expect(r.stdout).toContain('set');
    expect(r.stdout).toContain('clear');
    expect(r.stdout).toContain('list');
  });

  it('runs status when config exists and no command given', () => {
    const home = mkdtempSync(join(tmpdir(), 'agentbare-'));
    try {
      // Pre-write a minimal valid v2 config so the bare command takes the status branch.
      const cfgDir = join(home, '.agent-notifier');
      mkdirSync(cfgDir, { recursive: true });
      writeFileSync(join(cfgDir, 'config.json'), JSON.stringify({ version: 2, tz: 'UTC' }));
      const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: home };
      const r = spawnSync('node', [BIN], { env, encoding: 'utf8', timeout: 5000 });
      // status should exit 0 (or print something to stdout — we just verify no crash on the bare-command routing)
      expect(r.status).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
