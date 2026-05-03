import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('status', () => {
  let home: string; let project: string;
  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentst-')));
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
