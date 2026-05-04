import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// We import prompts lazily inside tests to pick up the per-test mock implementations
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
  const wired = opts.wired ?? false;
  let installCalled = 0;
  let uninstallCalled = 0;
  return {
    name,
    detect: vi.fn().mockResolvedValue(detected),
    isWired: vi.fn().mockResolvedValue(wired),
    install: vi.fn().mockImplementation(() => {
      installCalled++;
      return Promise.resolve();
    }),
    uninstall: vi.fn().mockImplementation(() => {
      uninstallCalled++;
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

describe('init — first-run (no pre-existing config)', () => {
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentinit-fr-')));
    mkdirSync(join(home, '.agent-notifier'), { recursive: true });
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

  it('writes a default config and skips install when no tools are detected', async () => {
    const { checkbox, confirm } = await getPrompts();
    // No tools detected → checkbox returns empty
    checkbox.mockResolvedValue([]);
    // confirm: "send a test notification?" → false
    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    // _installers: no detectable tools
    const inst = makeInstaller('claude-code', { detected: false });
    await runInit({ _installers: [inst] });

    const cfgPath = join(home, '.agent-notifier', 'config.json');
    expect(existsSync(cfgPath)).toBe(true);
    expect(inst.installCalled).toBe(0);
  });

  it('calls install() on each chosen tool', async () => {
    const { checkbox, confirm } = await getPrompts();
    const instA = makeInstaller('claude-code', { detected: true, wired: false });
    const instB = makeInstaller('codex', { detected: true, wired: false });

    // User picks both
    checkbox.mockResolvedValue(['claude-code', 'codex']);
    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [instA, instB] });

    expect(instA.install).toHaveBeenCalledOnce();
    expect(instB.install).toHaveBeenCalledOnce();
  });

  it('does NOT call install() for tools not in the checkbox selection', async () => {
    const { checkbox, confirm } = await getPrompts();
    const instA = makeInstaller('claude-code', { detected: true, wired: false });
    const instB = makeInstaller('codex', { detected: true, wired: false });

    // User picks only claude-code
    checkbox.mockResolvedValue(['claude-code']);
    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [instA, instB] });

    expect(instA.install).toHaveBeenCalledOnce();
    expect(instB.install).not.toHaveBeenCalled();
  });

  it('--tools flag bypasses checkbox and installs only specified tools (filtered by detected)', async () => {
    const { checkbox, confirm } = await getPrompts();
    const instA = makeInstaller('claude-code', { detected: true, wired: false });
    const instB = makeInstaller('codex', { detected: true, wired: false });
    const instC = makeInstaller('gemini', { detected: true, wired: false });

    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    await runInit({ tools: 'claude-code,codex', _installers: [instA, instB, instC] });

    // checkbox must NOT have been called
    expect(checkbox).not.toHaveBeenCalled();
    expect(instA.install).toHaveBeenCalledOnce();
    expect(instB.install).toHaveBeenCalledOnce();
    // gemini not in --tools → not installed
    expect(instC.install).not.toHaveBeenCalled();
  });

  it('--tools flag filters out undetected tools', async () => {
    const { confirm } = await getPrompts();
    // codex is not detected
    const instA = makeInstaller('claude-code', { detected: true, wired: false });
    const instB = makeInstaller('codex', { detected: false, wired: false });

    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    await runInit({ tools: 'claude-code,codex', _installers: [instA, instB] });

    expect(instA.install).toHaveBeenCalledOnce();
    expect(instB.install).not.toHaveBeenCalled();
  });

  it('--noTest:true skips the test notification and does not call confirm', async () => {
    const { checkbox, confirm } = await getPrompts();
    checkbox.mockResolvedValue([]);

    const { runInit } = await import('../src/init.js');
    await runInit({ noTest: true, _installers: [] });

    // confirm should not have been called (noTest === true means skip without asking)
    expect(confirm).not.toHaveBeenCalled();

    const stubFile = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stubFile)).toBe(false);
  });

  it('default first-run fires a test notification (wantTest=true by default)', async () => {
    const { checkbox, confirm } = await getPrompts();
    checkbox.mockResolvedValue([]);
    // Prompt default is true on first-run; user hits enter (returns true)
    confirm.mockResolvedValue(true);

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [] });

    // With AGENT_NOTIFIER_NOTIFY_IMPL=stub, stubNotifyAppend should have written the file
    const stubFile = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stubFile)).toBe(true);
    const lines = readFileSync(stubFile, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('first-run confirm prompt for test notification is called with default: true', async () => {
    const { checkbox, confirm } = await getPrompts();
    checkbox.mockResolvedValue([]);
    confirm.mockResolvedValue(false);

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [] });

    // The confirm call for test notification must have default: true on first-run
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
    expect((testConfirmCall![0] as Record<string, unknown>)['default']).toBe(true);
  });

  it('first-run banner reads "set up" not "reconfigure"', async () => {
    const { checkbox, confirm } = await getPrompts();
    checkbox.mockResolvedValue([]);
    confirm.mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log');

    const { runInit } = await import('../src/init.js');
    await runInit({ _installers: [] });

    const output = consoleSpy.mock.calls
      .flat()
      .map((a) => String(a))
      .join('\n');

    // Should contain "set up" not "reconfigure"
    expect(output).toMatch(/set up/i);
    expect(output).not.toMatch(/reconfigure/i);
  });
});
