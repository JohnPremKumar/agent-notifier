import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

interface SchedCfg {
  schedules: Array<{ id: string; type: string; days: string[]; from: string; to: string }>;
}

describe('schedule', () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'agentsch-')); });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });
  const cfg = (): SchedCfg => JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8')) as SchedCfg;

  it('add --allow stores an allow rule', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon-fri', '--from', '09:00', '--to', '18:00', '--id', 'work'], { env: env() });
    expect(cfg().schedules).toEqual([{ id: 'work', type: 'allow', days: ['mon','tue','wed','thu','fri'], from: '09:00', to: '18:00' }]);
  });

  it('add --deny stores a deny rule', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--deny', '--days', 'sat,sun', '--from', '00:00', '--to', '23:59', '--id', 'weekend'], { env: env() });
    expect(cfg().schedules[0]!.type).toBe('deny');
  });

  it('add auto-generates id when --id omitted', () => {
    execFileSync('node', [BIN, 'schedule', 'add', '--allow', '--days', 'mon', '--from', '09:00', '--to', '18:00'], { env: env() });
    expect(cfg().schedules[0]!.id).toMatch(/^sched-/);
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
