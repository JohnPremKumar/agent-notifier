import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn().mockResolvedValue(['claude-code']),
  input: vi.fn().mockResolvedValue('Asia/Kolkata'),
  confirm: vi
    .fn()
    .mockResolvedValueOnce(false) // wantSchedule = false (skip work-hours prompts)
    .mockResolvedValueOnce(true) // testThem = true
    .mockResolvedValue(true),
  select: vi.fn().mockResolvedValue('enabled'),
}));

describe('init (mocked prompts)', () => {
  let home: string;
  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentinit-')));
    mkdirSync(join(home, '.claude'));
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['APPDATA'] = home;
    process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] = 'stub';
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes a valid config with the captured timezone and project default', async () => {
    const { runInit } = await import('../src/init.js');
    await runInit();
    const cfgPath = join(home, '.agent-notifier', 'config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
      tz: string;
      projectDefault: { enabled: boolean };
    };
    expect(cfg.tz).toBe('Asia/Kolkata');
    expect(cfg.projectDefault.enabled).toBe(true);
  });
});
