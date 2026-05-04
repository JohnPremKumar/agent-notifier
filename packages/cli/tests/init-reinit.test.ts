import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '@agent-notifier/core';
import type { ToolInstaller } from '../src/install.js';

// Save originals so afterEach can restore them precisely
const origHome = process.env['HOME'];
const origUserProfile = process.env['USERPROFILE'];
const origAppData = process.env['APPDATA'];

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));

async function getPrompts() {
  const mod = await import('@inquirer/prompts');
  return {
    checkbox: mod.checkbox as MockedFunction<typeof mod.checkbox>,
    input: mod.input as MockedFunction<typeof mod.input>,
    confirm: mod.confirm as MockedFunction<typeof mod.confirm>,
    select: mod.select as MockedFunction<typeof mod.select>,
  };
}

function makeInstaller(
  name: 'claude-code' | 'codex' | 'gemini' | 'opencode',
  opts: {
    detected?: boolean;
    wired?: boolean;
  } = {},
): ToolInstaller & { installCalled: number; uninstallCalled: number } {
  const detected = opts.detected ?? true;
  let wired = opts.wired ?? false;
  let installCalled = 0;
  let uninstallCalled = 0;
  return {
    name,
    detect: vi.fn().mockResolvedValue(detected),
    isWired: vi.fn().mockImplementation(() => Promise.resolve(wired)),
    install: vi.fn().mockImplementation(() => {
      installCalled++;
      wired = true;
      return Promise.resolve();
    }),
    uninstall: vi.fn().mockImplementation(() => {
      uninstallCalled++;
      wired = false;
      return Promise.resolve();
    }),
    get installCalled() {
      return installCalled;
    },
    get uninstallCalled() {
      return uninstallCalled;
    },
  };
}

/** Write a v2 config with custom values to simulate a re-init scenario */
function writeExistingConfig(dir: string, overrides: Partial<Config> = {}): void {
  const base: Config = {
    version: 2,
    tz: 'Europe/London',
    global: { enabled: true },
    mute: null,
    schedules: [],
    tools: {
      'claude-code': { enabled: true },
      codex: { enabled: true },
      gemini: { enabled: false },
      opencode: { enabled: false },
    },
    projectDefault: { enabled: true },
    projects: {},
    idleGate: {
      mode: 'always-fire',
      thresholdSeconds: 90,
      unsupportedTerminalPolicy: 'gate',
    },
    sound: { darwin: 'Glass', win32: 'ms-winsoundevent:Notification.Default' },
    icon: { darwin: null, win32: null },
    logging: { maxBytes: 1_000_000, generations: 3 },
  };
  mkdirSync(join(dir, '.agent-notifier'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-notifier', 'config.json'),
    JSON.stringify({ ...base, ...overrides }, null, 2),
    'utf8',
  );
}

describe('init — re-init (pre-existing config)', () => {
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentinit-ri-')));
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

  it('reads existing config and presents currently-wired tools as checked in the checkbox', async () => {
    // claude-code + codex are wired in the existing config
    writeExistingConfig(home);

    const { checkbox, confirm } = await getPrompts();
    // The checkbox should preselect whatever is wired; we capture the call args
    checkbox.mockResolvedValue(['claude-code', 'codex']);
    confirm.mockResolvedValue(false);

    const instCC = makeInstaller('claude-code', { detected: true, wired: true });
    const instCX = makeInstaller('codex', { detected: true, wired: true });
    const instGM = makeInstaller('gemini', { detected: true, wired: false });

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [instCC, instCX, instGM] });

    // checkbox must have been called with checked:true for claude-code and codex
    expect(checkbox).toHaveBeenCalledOnce();
    const checkboxArg = checkbox.mock.calls[0]![0] as {
      choices: Array<{ name: string; value: string; checked: boolean }>;
    };
    const ccChoice = checkboxArg.choices.find((c) => c.value === 'claude-code');
    const cxChoice = checkboxArg.choices.find((c) => c.value === 'codex');
    const gmChoice = checkboxArg.choices.find((c) => c.value === 'gemini');

    expect(ccChoice?.checked).toBe(true);
    expect(cxChoice?.checked).toBe(true);
    expect(gmChoice?.checked).toBe(false);
  });

  it('hitting enter through all prompts (defaults) preserves the existing config', async () => {
    writeExistingConfig(home);

    const { checkbox, confirm } = await getPrompts();
    // Accept the defaults (claude-code + codex wired, as in the existing config)
    checkbox.mockResolvedValue(['claude-code', 'codex']);
    // "send a test notification?" → accept default (false on re-init)
    confirm.mockResolvedValue(false);

    const instCC = makeInstaller('claude-code', { detected: true, wired: true });
    const instCX = makeInstaller('codex', { detected: true, wired: true });
    const instGM = makeInstaller('gemini', { detected: true, wired: false });

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [instCC, instCX, instGM] });

    const cfgRaw = JSON.parse(
      readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'),
    ) as Config;
    // Config should still have the same tool states
    expect(cfgRaw.tools['claude-code']?.enabled).toBe(true);
    expect(cfgRaw.tools['codex']?.enabled).toBe(true);
    expect(cfgRaw.tools['gemini']?.enabled).toBe(false);
    // No install/uninstall calls since state didn't change
    expect(instCC.install).not.toHaveBeenCalled();
    expect(instCC.uninstall).not.toHaveBeenCalled();
    expect(instGM.install).not.toHaveBeenCalled();
  });

  it('toggling off a wired tool calls uninstall() and sets enabled=false in config', async () => {
    // Both claude-code and codex are wired
    writeExistingConfig(home);

    const { checkbox, confirm } = await getPrompts();
    // User untogles codex
    checkbox.mockResolvedValue(['claude-code']); // codex deselected
    confirm.mockResolvedValue(false);

    const instCC = makeInstaller('claude-code', { detected: true, wired: true });
    const instCX = makeInstaller('codex', { detected: true, wired: true });

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [instCC, instCX] });

    // uninstall called on codex
    expect(instCX.uninstall).toHaveBeenCalledOnce();
    // install NOT called on claude-code (already wired)
    expect(instCC.install).not.toHaveBeenCalled();

    // Config should reflect the updated state
    const cfgRaw = JSON.parse(
      readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'),
    ) as Config;
    expect(cfgRaw.tools['codex']?.enabled).toBe(false);
    expect(cfgRaw.tools['claude-code']?.enabled).toBe(true);
  });

  it('re-init banner reads "reconfigure" not "set up"', async () => {
    writeExistingConfig(home);

    const { checkbox, confirm } = await getPrompts();
    checkbox.mockResolvedValue(['claude-code', 'codex']);
    confirm.mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log');

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [makeInstaller('claude-code', { detected: true, wired: true })] });

    const output = consoleSpy.mock.calls
      .flat()
      .map((a) => String(a))
      .join('\n');

    expect(output).toMatch(/reconfigure/i);
    expect(output).not.toMatch(/set up/i);
  });

  it('confirm default for test notification is false on re-init', async () => {
    writeExistingConfig(home);

    const { checkbox, confirm } = await getPrompts();
    checkbox.mockResolvedValue(['claude-code', 'codex']);
    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [makeInstaller('claude-code', { detected: true, wired: true })] });

    // The confirm call for test notification must have default: false on re-init
    const confirmCalls = confirm.mock.calls;
    const testConfirmCall = confirmCalls.find(
      (c) =>
        typeof (c[0] as Record<string, unknown>)['message'] === 'string' &&
        (c[0] as Record<string, unknown>)['message']
          ?.toString()
          .toLowerCase()
          .includes('test notification'),
    );
    expect(testConfirmCall).toBeDefined();
    expect((testConfirmCall![0] as Record<string, unknown>)['default']).toBe(false);
  });

  it('toggling ON a new tool calls install() and sets enabled=true in config', async () => {
    // gemini was disabled; user now enables it
    writeExistingConfig(home);

    const { checkbox, confirm } = await getPrompts();
    // User selects all three
    checkbox.mockResolvedValue(['claude-code', 'codex', 'gemini']);
    confirm.mockResolvedValue(false);

    const instCC = makeInstaller('claude-code', { detected: true, wired: true });
    const instCX = makeInstaller('codex', { detected: true, wired: true });
    const instGM = makeInstaller('gemini', { detected: true, wired: false });

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [instCC, instCX, instGM] });

    expect(instGM.install).toHaveBeenCalledOnce();
    const cfgRaw = JSON.parse(
      readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8'),
    ) as Config;
    expect(cfgRaw.tools['gemini']?.enabled).toBe(true);
  });
});
