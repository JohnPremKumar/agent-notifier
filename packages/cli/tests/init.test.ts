import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The new runInit no longer prompts for timezone (derived from Intl) or
// a work-hours schedule (non-interactive flag only). The checkbox returns
// chosen tools and confirm covers only the test-notification question.
vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn().mockResolvedValue(['claude-code']),
  input: vi.fn().mockResolvedValue(''),
  confirm: vi.fn().mockResolvedValue(false), // "Send a test notification now?" → false
  select: vi.fn().mockResolvedValue('enabled'),
}));

// Save originals for clean restoration
const origHome = process.env['HOME'];
const origUserProfile = process.env['USERPROFILE'];
const origAppData = process.env['APPDATA'];

describe('init (mocked prompts)', () => {
  let home: string;
  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentinit-')));
    // The lock file is written to ~/.agent-notifier/ so we must create the dir.
    mkdirSync(join(home, '.agent-notifier'), { recursive: true });
    mkdirSync(join(home, '.claude'), { recursive: true });
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['APPDATA'] = home;
    process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] = 'stub';
  });
  afterEach(() => {
    if (origHome !== undefined) process.env['HOME'] = origHome;
    else delete process.env['HOME'];
    if (origUserProfile !== undefined) process.env['USERPROFILE'] = origUserProfile;
    else delete process.env['USERPROFILE'];
    if (origAppData !== undefined) process.env['APPDATA'] = origAppData;
    else delete process.env['APPDATA'];
    delete process.env['AGENT_NOTIFIER_NOTIFY_IMPL'];
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes a valid config with the detected timezone and project default', async () => {
    const { runInit } = await import('../src/init.js');
    // _installers: empty list so no checkbox interaction is needed for tool detection
    await runInit({ _installers: [] });
    const cfgPath = join(home, '.agent-notifier', 'config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
      tz: string;
      projectDefault: { enabled: boolean };
    };
    // tz is now auto-detected via Intl — we just check it's a non-empty string
    expect(typeof cfg.tz).toBe('string');
    expect(cfg.tz.length).toBeGreaterThan(0);
    expect(cfg.projectDefault.enabled).toBe(true);
  });
});
