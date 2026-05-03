// packages/core/tests/idle-gate.test.ts
import { describe, it, expect, vi } from 'vitest';
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
  type ExecFn,
} from '../src/idle-gate.js';

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
