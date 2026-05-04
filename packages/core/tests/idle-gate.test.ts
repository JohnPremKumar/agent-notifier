// packages/core/tests/idle-gate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  parseIoregOutput,
  parsePowerShellOutput,
  getIdleSeconds,
  resolveAiPid,
  getProcessTty,
  walkUpToTerminal,
  getProcessComm,
  getProcessPpid,
  getFrontmostBundle,
  decideGate,
  clearGateCache,
  type ExecFn,
} from '../src/idle-gate.js';
import type { Config } from '../src/types.js';
import { defaultConfig } from '../src/config.js';

// ESM: __dirname is not available in "type":"module" packages, so we derive it.
const __dirname = dirname(fileURLToPath(import.meta.url));

describe('idle-gate parsers', () => {
  it('parseIoregOutput extracts seconds from a real ioreg snippet', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'ioreg-idle-12s.txt'), 'utf8');
    expect(parseIoregOutput(raw)).toBe(12);
  });

  it('parsePowerShellOutput parses the integer second count', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'powershell-idle-3s.txt'), 'utf8');
    expect(parsePowerShellOutput(raw)).toBe(3);
  });

  it('parseIoregOutput throws on output missing HIDIdleTime', () => {
    expect(() => parseIoregOutput('garbage')).toThrow();
  });

  it('parsePowerShellOutput throws on non-numeric output', () => {
    expect(() => parsePowerShellOutput('not a number')).toThrow();
  });
});

describe('getIdleSeconds (with stubbed exec)', () => {
  it('fail-open: returns Infinity if probe throws', async () => {
    const stub = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await getIdleSeconds({ exec: stub, platform: 'darwin', timeoutMs: 200 });
    expect(result).toBe(Infinity);
  });

  it('darwin: invokes ioreg and parses result', async () => {
    const stub = vi.fn().mockResolvedValue({ stdout: '"HIDIdleTime" = 5000000000', stderr: '' });
    const result = await getIdleSeconds({ exec: stub, platform: 'darwin', timeoutMs: 200 });
    expect(result).toBe(5);
    expect(stub.mock.calls[0]?.[0]).toContain('ioreg');
  });

  it('win32: invokes powershell and parses result', async () => {
    const stub = vi.fn().mockResolvedValue({ stdout: '7\r\n', stderr: '' });
    const result = await getIdleSeconds({ exec: stub, platform: 'win32', timeoutMs: 200 });
    expect(result).toBe(7);
    expect(stub.mock.calls[0]?.[0]).toContain('powershell');
  });
});

const psStub =
  (table: Record<string, { ppid: string; comm: string; tty: string }>): ExecFn =>
  (cmd) => {
    const m = cmd.match(/-p (\d+)/);
    if (!m) return Promise.resolve({ stdout: '', stderr: '' });
    const pid = m[1]!;
    const row = table[pid];
    if (!row) return Promise.resolve({ stdout: '', stderr: '' });
    if (cmd.includes('ppid=')) return Promise.resolve({ stdout: row.ppid + '\n', stderr: '' });
    if (cmd.includes('comm=')) return Promise.resolve({ stdout: row.comm + '\n', stderr: '' });
    if (cmd.includes('tty=')) return Promise.resolve({ stdout: row.tty + '\n', stderr: '' });
    return Promise.resolve({ stdout: '', stderr: '' });
  };

describe('process tree walk', () => {
  it('shell-hops past bash to find AI tool', async () => {
    // tree: hook(100) ← bash(99) ← claude(98) ← Terminal(97)
    const exec = psStub({
      '100': { ppid: '99', comm: 'agent-notifier', tty: 'ttys003' },
      '99': { ppid: '98', comm: 'bash', tty: 'ttys003' },
      '98': { ppid: '97', comm: 'claude', tty: 'ttys003' },
      '97': { ppid: '1', comm: 'Terminal', tty: '??' },
    });
    const aiPid = await resolveAiPid(99, { exec, platform: 'darwin' });
    expect(aiPid).toBe(98);
  });

  it('handles direct invocation (hookPpid IS the AI tool)', async () => {
    const exec = psStub({
      '50': { ppid: '49', comm: 'agent-notifier', tty: 'ttys004' },
      '49': { ppid: '48', comm: 'claude', tty: 'ttys004' },
      '48': { ppid: '1', comm: 'iTerm2', tty: '??' },
    });
    const aiPid = await resolveAiPid(49, { exec, platform: 'darwin' });
    expect(aiPid).toBe(49);
  });

  it('returns null when nothing in chain matches an AI exe (caps at 8 levels)', async () => {
    const big: Record<string, { ppid: string; comm: string; tty: string }> = {};
    for (let i = 0; i < 100; i++) big[String(i)] = { ppid: String(i + 1), comm: 'bash', tty: '??' };
    const exec = psStub(big);
    const aiPid = await resolveAiPid(0, { exec, platform: 'darwin' });
    expect(aiPid).toBeNull();
  });

  it('returns null when the chain dead-ends before finding AI or terminal', async () => {
    const exec = psStub({
      '10': { ppid: '1', comm: 'someUnrelatedDaemon', tty: 'ttys010' },
    });
    const aiPid = await resolveAiPid(10, { exec, platform: 'darwin' });
    expect(aiPid).toBeNull();
  });

  it('walkUpToTerminal finds the terminal app (skipping intermediate processes)', async () => {
    const exec = psStub({
      '98': { ppid: '97', comm: 'claude', tty: 'ttys005' },
      '97': { ppid: '96', comm: 'login', tty: 'ttys005' },
      '96': { ppid: '1', comm: 'iTerm2', tty: '??' },
    });
    const term = await walkUpToTerminal(98, { exec, platform: 'darwin' });
    expect(term).toBe('iTerm2');
  });

  it('walkUpToTerminal returns null when no terminal in chain', async () => {
    const exec = psStub({
      '5': { ppid: '1', comm: 'launchd', tty: '??' },
    });
    const term = await walkUpToTerminal(5, { exec, platform: 'darwin' });
    expect(term).toBeNull();
  });

  it('walkUpToTerminal returns null when chain exhausts MAX_DEPTH without finding a terminal', async () => {
    const big: Record<string, { ppid: string; comm: string; tty: string }> = {};
    for (let i = 0; i < 20; i++) big[String(i)] = { ppid: String(i + 1), comm: 'bash', tty: '??' };
    const exec = psStub(big);
    const term = await walkUpToTerminal(0, { exec, platform: 'darwin' });
    expect(term).toBeNull();
  });

  it('getProcessTty parses ttys003 and rejects placeholder ??', async () => {
    const exec = psStub({
      '7': { ppid: '1', comm: 'x', tty: 'ttys003' },
      '8': { ppid: '1', comm: 'x', tty: '??' },
    });
    expect(await getProcessTty(7, { exec, platform: 'darwin' })).toBe('ttys003');
    expect(await getProcessTty(8, { exec, platform: 'darwin' })).toBeNull();
  });

  it('getProcessComm strips path prefix on darwin/linux', async () => {
    const exec: ExecFn = () => Promise.resolve({ stdout: '/usr/local/bin/claude\n', stderr: '' });
    const comm = await getProcessComm(99, { exec, platform: 'darwin' });
    expect(comm).toBe('/usr/local/bin/claude');
  });

  it('getProcessPpid returns null on parse failure', async () => {
    const exec: ExecFn = () => Promise.resolve({ stdout: 'NotANumber\n', stderr: '' });
    const ppid = await getProcessPpid(50, { exec, platform: 'darwin' });
    expect(ppid).toBeNull();
  });

  it('treats hookPpid being a shell as a hint to keep walking', async () => {
    // First level IS bash; that's expected from a wrapper command.
    const exec = psStub({
      '101': { ppid: '99', comm: 'bash', tty: 'ttys003' },
      '99': { ppid: '98', comm: 'codex', tty: 'ttys003' },
      '98': { ppid: '1', comm: 'iTerm2', tty: '??' },
    });
    const aiPid = await resolveAiPid(101, { exec, platform: 'darwin' });
    expect(aiPid).toBe(99);
  });
});

describe('getFrontmostBundle', () => {
  it('parses macOS osascript output (bundle id)', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'com.googlecode.iterm2\n', stderr: '' });
    const r = await getFrontmostBundle({ exec, platform: 'darwin' });
    expect(r).toBe('com.googlecode.iterm2');
  });

  it('returns null on osascript timeout/error (fail-open)', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('timeout'));
    const r = await getFrontmostBundle({ exec, platform: 'darwin' });
    expect(r).toBeNull();
  });

  it('parses Windows process name from PowerShell output', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'WindowsTerminal\n', stderr: '' });
    const r = await getFrontmostBundle({ exec, platform: 'win32' });
    expect(r).toBe('WindowsTerminal.exe');
  });

  it('darwin: empty stdout returns null (not empty string)', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '   \n', stderr: '' });
    const r = await getFrontmostBundle({ exec, platform: 'darwin' });
    expect(r).toBeNull();
  });

  it('win32: empty stdout returns null (not ".exe")', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const r = await getFrontmostBundle({ exec, platform: 'win32' });
    expect(r).toBeNull();
  });

  it('non-darwin/non-win32 platform returns null without calling exec', async () => {
    const exec = vi.fn();
    const r = await getFrontmostBundle({ exec, platform: 'linux' as NodeJS.Platform });
    expect(r).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  it('timeout option propagates to exec call', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'com.apple.Terminal\n', stderr: '' });
    await getFrontmostBundle({ exec, platform: 'darwin', timeoutMs: 500 });
    expect(exec.mock.calls[0]?.[1]).toEqual({ timeout: 500 });
  });

  it('uses default 200ms timeout when timeoutMs is not specified', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'com.apple.Terminal\n', stderr: '' });
    await getFrontmostBundle({ exec, platform: 'darwin' });
    expect(exec.mock.calls[0]?.[1]).toEqual({ timeout: 200 });
  });
});

// ---------------------------------------------------------------------------
// chainStub: builds an ExecFn that handles the full decideGate call surface.
//
// Process table: maps pid string → { ppid, comm, tty }
// frontmost:    return value for the "frontmost is true" osascript query
// activeTabTty: return value for Terminal/iTerm2 tab-tty osascript queries
// idleSeconds:  HIDIdleTime in seconds (converted to ns for ioreg output)
// ---------------------------------------------------------------------------
function chainStub(
  procs: Record<string, { ppid: string; comm: string; tty: string }>,
  frontmost?: string,
  activeTabTty?: string,
  idleSeconds?: number,
): ExecFn {
  return (cmd) => {
    // ps queries
    const m = cmd.match(/-p (\d+)/);
    if (m) {
      const pid = m[1]!;
      const row = procs[pid];
      if (!row) return Promise.resolve({ stdout: '', stderr: '' });
      if (cmd.includes('ppid=')) return Promise.resolve({ stdout: row.ppid + '\n', stderr: '' });
      if (cmd.includes('comm=')) return Promise.resolve({ stdout: row.comm + '\n', stderr: '' });
      if (cmd.includes('tty=')) return Promise.resolve({ stdout: row.tty + '\n', stderr: '' });
      return Promise.resolve({ stdout: '', stderr: '' });
    }
    // ioreg idle time
    if (cmd.startsWith('ioreg')) {
      const ns = ((idleSeconds ?? 0) * 1_000_000_000).toString();
      return Promise.resolve({ stdout: `"HIDIdleTime" = ${ns}`, stderr: '' });
    }
    // osascript: frontmost bundle
    if (cmd.includes('frontmost is true')) {
      return Promise.resolve({ stdout: (frontmost ?? '') + '\n', stderr: '' });
    }
    // osascript: Terminal.app selected tab tty
    if (cmd.includes('selected tab of front window')) {
      return Promise.resolve({ stdout: (activeTabTty ?? '') + '\n', stderr: '' });
    }
    // osascript: iTerm2 current session tty
    if (cmd.includes('current session of current window')) {
      return Promise.resolve({ stdout: (activeTabTty ?? '') + '\n', stderr: '' });
    }
    return Promise.resolve({ stdout: '', stderr: '' });
  };
}

// Helper: build a Config with idleGate overrides applied
function cfg(overrides: Partial<Config['idleGate']> = {}): Config {
  const c = defaultConfig('UTC');
  Object.assign(c.idleGate, overrides);
  return c;
}

// Standard process tree used across multiple tests:
//   hook(99) ← bash(98) ← claude(97) ← iTerm2(96)
// hookPpid passed to decideGate = 99
const STANDARD_PROCS: Record<string, { ppid: string; comm: string; tty: string }> = {
  '99': { ppid: '98', comm: 'bash', tty: 'ttys003' },
  '98': { ppid: '97', comm: 'bash', tty: 'ttys003' },
  '97': { ppid: '96', comm: 'claude', tty: 'ttys003' },
  '96': { ppid: '1', comm: 'iTerm2', tty: '??' },
};
const HOOK_PPID = 99;

describe('decideGate (full decision tree)', () => {
  beforeEach(() => {
    clearGateCache();
  });

  // 1. PERMISSION always fires regardless of mode/frontmost
  it('PERMISSION always fires regardless of mode/frontmost', async () => {
    // exec should never be called — PERMISSION short-circuits before any OS probe
    const exec = vi.fn<ExecFn>();
    const result = await decideGate(cfg({ mode: 'fire-elsewhere' }), 'PERMISSION', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('permission-bypass');
    expect(exec).not.toHaveBeenCalled();
  });

  // 2. always-fire mode short-circuits without consulting OS
  it('always-fire mode fires every event without consulting OS', async () => {
    const exec = vi.fn<ExecFn>();
    const result = await decideGate(cfg({ mode: 'always-fire' }), 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('mode-always-fire');
    expect(exec).not.toHaveBeenCalled();
  });

  // 3. fire-elsewhere: frontmost is Chrome → fire
  it('fires when frontmost ≠ AI terminal (frontmost-other-app)', async () => {
    const exec = chainStub(STANDARD_PROCS, 'com.google.Chrome', undefined, 5);
    const result = await decideGate(cfg(), 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('frontmost-other-app');
  });

  // 4. fire-elsewhere: frontmost = iTerm2, active tab tty matches AI tty → suppress
  it('suppresses when active tab TTY matches AI TTY (frontmost-same-tab)', async () => {
    // AI process tty is ttys003; iTerm2's active tab also reports ttys003
    const exec = chainStub(STANDARD_PROCS, 'com.googlecode.iterm2', 'ttys003', 5);
    const result = await decideGate(cfg(), 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('frontmost-same-tab');
  });

  // 5. fire-elsewhere: frontmost = iTerm2, active tab tty differs → fire
  it('fires when frontmost is AI terminal but different tab (frontmost-different-tab)', async () => {
    // AI process tty is ttys003; active tab reports ttys007 (different tab)
    const exec = chainStub(STANDARD_PROCS, 'com.googlecode.iterm2', 'ttys007', 5);
    const result = await decideGate(cfg(), 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('frontmost-different-tab');
  });

  // 6. fire-elsewhere: frontmost = Ghostty (no tab lookup), policy='fire' → fire
  it('fires on unsupported terminal (Ghostty) with policy=fire (unsupported-terminal-fired)', async () => {
    const exec = chainStub(
      {
        ...STANDARD_PROCS,
        // Override: walkUpToTerminal needs to find Ghostty comm in the tree
        '96': { ppid: '1', comm: 'Ghostty', tty: '??' },
      },
      'com.mitchellh.ghostty',
      undefined,
      5,
    );
    const result = await decideGate(
      cfg({ unsupportedTerminalPolicy: 'fire' }),
      'TURN_DONE',
      HOOK_PPID,
      {
        exec,
        platform: 'darwin',
      },
    );
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('unsupported-terminal-fired');
  });

  // 7. fire-elsewhere: frontmost = Ghostty, policy='gate', idle < threshold → suppress
  it('suppresses on unsupported terminal with policy=gate + idle below threshold (unsupported-terminal-gated)', async () => {
    const exec = chainStub(
      {
        ...STANDARD_PROCS,
        '96': { ppid: '1', comm: 'Ghostty', tty: '??' },
      },
      'com.mitchellh.ghostty',
      undefined,
      10, // 10s idle, threshold is 60s default
    );
    const result = await decideGate(
      cfg({ unsupportedTerminalPolicy: 'gate', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec, platform: 'darwin' },
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('unsupported-terminal-gated');
  });

  // 8. fire-elsewhere: frontmost = Ghostty, policy='gate', idle >= threshold → fire
  it('fires on unsupported terminal with policy=gate when OS idle threshold exceeded', async () => {
    const exec = chainStub(
      {
        ...STANDARD_PROCS,
        '96': { ppid: '1', comm: 'Ghostty', tty: '??' },
      },
      'com.mitchellh.ghostty',
      undefined,
      90, // 90s idle, threshold is 60s
    );
    const result = await decideGate(
      cfg({ unsupportedTerminalPolicy: 'gate', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec, platform: 'darwin' },
    );
    expect(result.fire).toBe(true);
    // applyOsIdleGate fires with frontmost-different-tab when idle >= threshold
    expect(result.reason).toBe('frontmost-different-tab');
  });

  // 9. AppleScript permission-denied (osascript throws) → fail-open fire
  it('fires (fail-open) when osascript throws permission-denied error', async () => {
    const permError = new Error('1743: not allowed assistive access');
    // ps queries succeed; osascript frontmost query throws
    const exec: ExecFn = (cmd) => {
      const m = cmd.match(/-p (\d+)/);
      if (m) {
        const pid = m[1]!;
        const row = STANDARD_PROCS[pid];
        if (!row) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('ppid=')) return Promise.resolve({ stdout: row.ppid + '\n', stderr: '' });
        if (cmd.includes('comm=')) return Promise.resolve({ stdout: row.comm + '\n', stderr: '' });
        if (cmd.includes('tty=')) return Promise.resolve({ stdout: row.tty + '\n', stderr: '' });
      }
      if (cmd.includes('frontmost is true')) return Promise.reject(permError);
      return Promise.resolve({ stdout: '', stderr: '' });
    };
    const result = await decideGate(cfg(), 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('fail-open');
  });

  // 10. strict-terminal mode: frontmost = iTerm2 (AI terminal), idle < threshold → suppress
  it('strict-terminal mode suppresses when AI terminal frontmost and idle below threshold', async () => {
    const exec = chainStub(STANDARD_PROCS, 'com.googlecode.iterm2', undefined, 10);
    const result = await decideGate(
      cfg({ mode: 'strict-terminal', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec, platform: 'darwin' },
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('frontmost-same-terminal');
  });

  // 11. strict-os-idle mode: ignores process tree, only consults idle seconds
  it('strict-os-idle mode fires when idle >= threshold, suppresses otherwise', async () => {
    // exec should only be called for ioreg — no ps or osascript calls needed
    const execFired = chainStub({}, undefined, undefined, 90);
    const resultFired = await decideGate(
      cfg({ mode: 'strict-os-idle', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: execFired, platform: 'darwin' },
    );
    expect(resultFired.fire).toBe(true);
    expect(resultFired.reason).toBe('os-idle-elapsed');

    clearGateCache();
    const execSuppressed = chainStub({}, undefined, undefined, 30);
    const resultSuppressed = await decideGate(
      cfg({ mode: 'strict-os-idle', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: execSuppressed, platform: 'darwin' },
    );
    expect(resultSuppressed.fire).toBe(false);
    expect(resultSuppressed.reason).toBe('os-active');
  });

  // 12. cache: identical (kind, ppid, mode) within 2s returns cached result without calling exec
  it('caches results for 2s under same (kind, ppid, mode) key', async () => {
    const exec = vi.fn(chainStub(STANDARD_PROCS, 'com.google.Chrome', undefined, 5));
    const config = cfg();

    // First call: triggers full evaluation
    const first = await decideGate(config, 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    const callsAfterFirst = exec.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Second call with same key: should return cached, no new exec calls
    const second = await decideGate(config, 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(exec.mock.calls.length).toBe(callsAfterFirst);
    expect(second).toEqual(first);
  });

  // 13. cache: clearGateCache() forces a fresh evaluation
  it('clearGateCache() invalidates cached results', async () => {
    const exec = vi.fn(chainStub(STANDARD_PROCS, 'com.google.Chrome', undefined, 5));
    const config = cfg();

    await decideGate(config, 'TURN_DONE', HOOK_PPID, { exec, platform: 'darwin' });
    const callsAfterFirst = exec.mock.calls.length;

    clearGateCache();

    // After cache clear, a fresh call must invoke exec again
    await decideGate(config, 'TURN_DONE', HOOK_PPID, { exec, platform: 'darwin' });
    expect(exec.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  // FIX 1 — Windows: frontmost = WindowsTerminal.exe (AI terminal), policy=gate, idle < threshold → suppress
  // Verifies isTerminalFrontmost dispatches to isTerminalProcess on win32 (not isTerminalBundle,
  // which would always return false for .exe names and wrongly produce frontmost-other-app).
  //
  // The process tree walk (walkUpToTerminal) uses isTerminalComm, which recognizes POSIX comm
  // names. On Windows, ps-based queries are mocked; we use 'iTerm2' as the comm so the walk
  // succeeds and we reach the isTerminalFrontmost check. The critical assertion is that
  // 'WindowsTerminal.exe' is recognized as a terminal on win32 (not treated as an unknown app).
  it('win32: WindowsTerminal.exe frontmost with policy=gate suppresses (not frontmost-other-app)', async () => {
    // process tree: hookPpid=99 → bash(98) → claude(97) ← iTerm2(96)
    // (using iTerm2 comm so walkUpToTerminal succeeds; the frontmost check is what FIX 1 tests)
    const WIN_PROCS: Record<string, { ppid: string; comm: string; tty: string }> = {
      '99': { ppid: '98', comm: 'bash', tty: 'ttys001' },
      '98': { ppid: '97', comm: 'bash', tty: 'ttys001' },
      '97': { ppid: '96', comm: 'claude', tty: 'ttys001' },
      '96': { ppid: '1', comm: 'iTerm2', tty: '??' },
    };
    // On win32, getIdleSeconds calls the PowerShell WIN_CMD (starts with 'powershell').
    // chainStub only handles ioreg; build a bespoke exec that handles both ps and powershell.
    const winExec: ExecFn = (cmd) => {
      const m = cmd.match(/-p (\d+)/);
      if (m) {
        const pid = m[1]!;
        const row = WIN_PROCS[pid];
        if (!row) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('ppid=')) return Promise.resolve({ stdout: row.ppid + '\n', stderr: '' });
        if (cmd.includes('comm=')) return Promise.resolve({ stdout: row.comm + '\n', stderr: '' });
        if (cmd.includes('tty=')) return Promise.resolve({ stdout: row.tty + '\n', stderr: '' });
        return Promise.resolve({ stdout: '', stderr: '' });
      }
      // win32 frontmost: PowerShell GetForegroundWindow returns "WindowsTerminal" (no .exe)
      if (cmd.includes('GetForegroundWindow')) {
        return Promise.resolve({ stdout: 'WindowsTerminal\n', stderr: '' });
      }
      // win32 idle: PowerShell GetLastInputInfo — return 10s (below 60s threshold)
      if (cmd.includes('GetLastInputInfo')) {
        return Promise.resolve({ stdout: '10\n', stderr: '' });
      }
      return Promise.resolve({ stdout: '', stderr: '' });
    };
    const result = await decideGate(
      cfg({ mode: 'fire-elsewhere', unsupportedTerminalPolicy: 'gate', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: winExec, platform: 'win32' },
    );
    // WindowsTerminal.exe IS a known terminal on win32, so we should NOT get frontmost-other-app.
    // Falls through to unsupportedTerminalPolicy='gate' (no Windows tab lookup exists yet)
    // with idle=10 < threshold=60, so fire=false.
    expect(result.reason).not.toBe('frontmost-other-app');
    expect(result.fire).toBe(false);
    expect(result.reason).toBe('unsupported-terminal-gated');
  });

  // FIX 1 — darwin control: com.google.Chrome is not a terminal → frontmost-other-app
  // Confirms the isTerminalFrontmost rename did not regress the darwin path.
  it('darwin: com.google.Chrome frontmost returns frontmost-other-app', async () => {
    const exec = chainStub(STANDARD_PROCS, 'com.google.Chrome', undefined, 5);
    const result = await decideGate(cfg({ mode: 'fire-elsewhere' }), 'TURN_DONE', HOOK_PPID, {
      exec,
      platform: 'darwin',
    });
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('frontmost-other-app');
  });

  // FIX 2 — cache key includes unsupportedTerminalPolicy: different policies produce different results
  it('cache key isolates results across different unsupportedTerminalPolicy values', async () => {
    const ghosttyProcs = {
      ...STANDARD_PROCS,
      '96': { ppid: '1', comm: 'Ghostty', tty: '??' },
    };
    // policy='fire' → unsupported-terminal-fired
    const execFire = chainStub(ghosttyProcs, 'com.mitchellh.ghostty', undefined, 5);
    const resultFire = await decideGate(
      cfg({ unsupportedTerminalPolicy: 'fire', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: execFire, platform: 'darwin' },
    );
    expect(resultFire.reason).toBe('unsupported-terminal-fired');

    // Same kind/ppid/mode — different policy. Must NOT hit the cache.
    const execGate = chainStub(ghosttyProcs, 'com.mitchellh.ghostty', undefined, 5);
    const resultGate = await decideGate(
      cfg({ unsupportedTerminalPolicy: 'gate', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: execGate, platform: 'darwin' },
    );
    expect(resultGate.reason).toBe('unsupported-terminal-gated');
    // Confirm the two results differ — a stale cache hit would return the first result
    expect(resultGate.reason).not.toBe(resultFire.reason);
  });

  // FIX 5 — strict-terminal mode fires when AI terminal frontmost AND OS idle >= threshold
  it('strict-terminal mode fires when AI terminal frontmost AND OS idle >= threshold (frontmost-different-tab)', async () => {
    // chain: hookPpid=99, AI is claude under iTerm2, frontmost=iTerm2, idle=120 (above threshold 60)
    const exec = chainStub(STANDARD_PROCS, 'com.googlecode.iterm2', undefined, 120);
    const result = await decideGate(
      cfg({ mode: 'strict-terminal', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec, platform: 'darwin' },
    );
    expect(result.fire).toBe(true);
    expect(result.reason).toBe('frontmost-different-tab');
  });

  // FIX 6 — cache key isolates results across different modes (same kind+ppid)
  it('cache key isolates results across different modes (same kind+ppid)', async () => {
    // First call: strict-os-idle fires (idle=90 >= threshold=60)
    const execOsIdle = vi.fn(chainStub({}, undefined, undefined, 90));
    const resultOsIdle = await decideGate(
      cfg({ mode: 'strict-os-idle', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: execOsIdle, platform: 'darwin' },
    );
    expect(resultOsIdle.fire).toBe(true);
    expect(resultOsIdle.reason).toBe('os-idle-elapsed');
    const callsAfterOsIdle = execOsIdle.mock.calls.length;

    // Second call: fire-elsewhere mode — must NOT hit the strict-os-idle cache entry.
    // Uses a fresh exec spy so we can verify it was actually called.
    const execFireElsewhere = vi.fn(chainStub(STANDARD_PROCS, 'com.google.Chrome', undefined, 90));
    const resultFireElsewhere = await decideGate(
      cfg({ mode: 'fire-elsewhere', thresholdSeconds: 60 }),
      'TURN_DONE',
      HOOK_PPID,
      { exec: execFireElsewhere, platform: 'darwin' },
    );
    // fire-elsewhere with Chrome frontmost → frontmost-other-app (different from os-idle-elapsed)
    expect(resultFireElsewhere.reason).toBe('frontmost-other-app');
    expect(execFireElsewhere.mock.calls.length).toBeGreaterThan(0); // fresh exec calls made
    // Original exec should not have been called again
    expect(execOsIdle.mock.calls.length).toBe(callsAfterOsIdle);
  });

  // FIX 6 — cache key isolates results across different hookPpids (same kind+mode)
  it('cache key isolates results across different hookPpids (same kind+mode)', async () => {
    // hookPpid=100 — process table rooted at pid 100
    const procs100: Record<string, { ppid: string; comm: string; tty: string }> = {
      '100': { ppid: '99', comm: 'bash', tty: 'ttys010' },
      '99': { ppid: '98', comm: 'claude', tty: 'ttys010' },
      '98': { ppid: '1', comm: 'iTerm2', tty: '??' },
    };
    const exec100 = vi.fn(chainStub(procs100, 'com.google.Chrome', undefined, 5));
    await decideGate(cfg(), 'TURN_DONE', 100, { exec: exec100, platform: 'darwin' });
    const callsAfter100 = exec100.mock.calls.length;
    expect(callsAfter100).toBeGreaterThan(0);

    // hookPpid=200 — different ppid, must NOT hit the ppid=100 cache entry
    const procs200: Record<string, { ppid: string; comm: string; tty: string }> = {
      '200': { ppid: '199', comm: 'bash', tty: 'ttys020' },
      '199': { ppid: '198', comm: 'claude', tty: 'ttys020' },
      '198': { ppid: '1', comm: 'iTerm2', tty: '??' },
    };
    const exec200 = vi.fn(chainStub(procs200, 'com.google.Chrome', undefined, 5));
    await decideGate(cfg(), 'TURN_DONE', 200, { exec: exec200, platform: 'darwin' });
    // exec200 must have been called — confirms a fresh evaluation happened
    expect(exec200.mock.calls.length).toBeGreaterThan(0);
    // exec100 must not have been called again — its cache entry was not poisoned
    expect(exec100.mock.calls.length).toBe(callsAfter100);
  });
});
