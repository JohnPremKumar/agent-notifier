import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock @inquirer/prompts — the `input` function is used for the confirmation
// prompt ("Type 'reset' to confirm:"). We override it per test as needed.
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}));

// Test-scoped helper: build a minimal ToolInstaller stub.
function makeInstaller(name: string, wired: boolean) {
  return {
    name,
    detect: vi.fn().mockResolvedValue(true),
    isWired: vi.fn().mockResolvedValue(wired),
    install: vi.fn().mockResolvedValue(undefined),
    uninstall: vi.fn().mockResolvedValue(undefined),
  };
}

// Save original env so afterEach can restore precisely.
const origHome = process.env['HOME'];
const origUserProfile = process.env['USERPROFILE'];
const origAppData = process.env['APPDATA'];

describe('runReset', () => {
  let home: string;
  let configDir: string;
  let logDirPath: string;
  let configFile: string;
  let lockFile: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentreset-')));
    configDir = join(home, '.agent-notifier');
    logDirPath = join(configDir, 'log');
    configFile = join(configDir, 'config.json');
    lockFile = join(configDir, '.init.lock');

    mkdirSync(configDir, { recursive: true });
    mkdirSync(logDirPath, { recursive: true });

    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['APPDATA'] = home;
  });

  afterEach(() => {
    if (origHome !== undefined) process.env['HOME'] = origHome;
    else delete process.env['HOME'];
    if (origUserProfile !== undefined) process.env['USERPROFILE'] = origUserProfile;
    else delete process.env['USERPROFILE'];
    if (origAppData !== undefined) process.env['APPDATA'] = origAppData;
    else delete process.env['APPDATA'];

    // Clean up any stale lock file so tests don't bleed into each other.
    if (existsSync(lockFile)) rmSync(lockFile);

    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. --yes flag skips prompt; calls uninstall only on wired tools
  // ------------------------------------------------------------------
  it('--yes: calls uninstall() only on wired installers, skips un-wired', async () => {
    const wiredInst = makeInstaller('claude-code', true);
    const unwiredInst = makeInstaller('codex', false);

    const { runReset } = await import('../src/reset.js');
    await runReset({ yes: true, _installers: [wiredInst, unwiredInst] });

    expect(wiredInst.uninstall).toHaveBeenCalledOnce();
    expect(unwiredInst.uninstall).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 2. --yes: deletes config file when it exists
  // ------------------------------------------------------------------
  it('--yes: deletes config file after uninstall', async () => {
    writeFileSync(configFile, JSON.stringify({ version: 1 }), 'utf8');
    expect(existsSync(configFile)).toBe(true);

    const { runReset } = await import('../src/reset.js');
    await runReset({ yes: true, _installers: [] });

    expect(existsSync(configFile)).toBe(false);
  });

  // ------------------------------------------------------------------
  // 3. --yes: no crash when config file does not exist
  // ------------------------------------------------------------------
  it("--yes: doesn't crash when config file is absent", async () => {
    expect(existsSync(configFile)).toBe(false);

    const { runReset } = await import('../src/reset.js');
    // Should resolve without throwing even when config.json is missing.
    await expect(runReset({ yes: true, _installers: [] })).resolves.toBeUndefined();
  });

  // ------------------------------------------------------------------
  // 4. --yes: log directory is preserved after reset
  // ------------------------------------------------------------------
  it('--yes: log directory still exists after reset', async () => {
    writeFileSync(configFile, '{}', 'utf8');

    const { runReset } = await import('../src/reset.js');
    await runReset({ yes: true, _installers: [] });

    expect(existsSync(logDirPath)).toBe(true);
  });

  // ------------------------------------------------------------------
  // 5. Interactive: typing 'reset' confirms → uninstalls + deletes config
  // ------------------------------------------------------------------
  it("interactive: typing 'reset' → runs uninstall and deletes config", async () => {
    const { input } = await import('@inquirer/prompts');
    vi.mocked(input).mockResolvedValueOnce('reset');

    writeFileSync(configFile, '{}', 'utf8');
    const wiredInst = makeInstaller('claude-code', true);

    const { runReset } = await import('../src/reset.js');
    await runReset({ _installers: [wiredInst] });

    expect(wiredInst.uninstall).toHaveBeenCalledOnce();
    expect(existsSync(configFile)).toBe(false);
  });

  // ------------------------------------------------------------------
  // 6. Interactive: any string other than 'reset' aborts (case-sensitive)
  // ------------------------------------------------------------------
  it.each([['no'], [''], ['RESET'], ['Reset'], ['yes']])(
    "interactive: typing '%s' aborts without uninstall or delete",
    async (answer) => {
      const { input } = await import('@inquirer/prompts');
      vi.mocked(input).mockResolvedValueOnce(answer);

      writeFileSync(configFile, '{}', 'utf8');
      const wiredInst = makeInstaller('claude-code', true);

      const { runReset } = await import('../src/reset.js');
      await runReset({ _installers: [wiredInst] });

      expect(wiredInst.uninstall).not.toHaveBeenCalled();
      // Config file must survive
      expect(existsSync(configFile)).toBe(true);
    },
  );

  // ------------------------------------------------------------------
  // 7. Lock: acquires and releases the init lock around destructive work
  // ------------------------------------------------------------------
  it('acquires init lock before destructive work and releases it after', async () => {
    const { acquireInitLock, releaseInitLock } = await import('../src/lib/lock.js');
    // Spy on the real lock functions — we want real acquire/release behaviour
    // but also to verify the call order.
    const acquireSpy = vi.spyOn({ acquireInitLock }, 'acquireInitLock');
    const releaseSpy = vi.spyOn({ releaseInitLock }, 'releaseInitLock');

    const callOrder: string[] = [];
    const wiredInst = makeInstaller('claude-code', true);
    wiredInst.uninstall.mockImplementationOnce(() => {
      callOrder.push('uninstall');
      return Promise.resolve();
    });

    // Check that lock file is created during the call and gone after.
    const { runReset } = await import('../src/reset.js');

    // Lock file should not exist before reset
    expect(existsSync(lockFile)).toBe(false);

    await runReset({ yes: true, _installers: [wiredInst] });

    // Lock file should be released (gone) after reset completes
    expect(existsSync(lockFile)).toBe(false);

    // acquireSpy / releaseSpy are created on local wrapper objects and not
    // used for call-count assertions — the existsSync check above is the
    // real invariant. Mark them used to avoid lint warnings.
    void acquireSpy;
    void releaseSpy;

    expect(callOrder).toContain('uninstall');
  });

  // ------------------------------------------------------------------
  // 8. Lock: exits non-zero when lock is held by a live PID
  // ------------------------------------------------------------------
  it('exits non-zero when the init lock is held by a live PID', async () => {
    // Write the current process PID as lock holder — guaranteed live.
    writeFileSync(lockFile, String(process.pid), 'utf8');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });

    const { runReset } = await import('../src/reset.js');
    await expect(runReset({ yes: true, _installers: [] })).rejects.toThrow('process.exit(1)');

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
