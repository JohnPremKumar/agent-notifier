import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Save originals so afterEach can restore them precisely
const origHome = process.env['HOME'];
const origUserProfile = process.env['USERPROFILE'];
const origAppData = process.env['APPDATA'];

describe('lock', () => {
  let home: string;
  let lockFile: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentlock-')));
    // Create the config dir so configDir() doesn't need to create it
    mkdirSync(join(home, '.agent-notifier'), { recursive: true });

    // Override env so configDir() from @agent-notifier/core resolves to our temp dir
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['APPDATA'] = home;

    lockFile = join(home, '.agent-notifier', '.init.lock');
  });

  afterEach(() => {
    // Restore env vars to originals
    if (origHome !== undefined) process.env['HOME'] = origHome;
    else delete process.env['HOME'];
    if (origUserProfile !== undefined) process.env['USERPROFILE'] = origUserProfile;
    else delete process.env['USERPROFILE'];
    if (origAppData !== undefined) process.env['APPDATA'] = origAppData;
    else delete process.env['APPDATA'];

    rmSync(home, { recursive: true, force: true });
  });

  it('acquireInitLock succeeds on a clean dir and releaseInitLock removes the file', async () => {
    const { acquireInitLock, releaseInitLock } = await import('../src/lib/lock.js');
    const result = acquireInitLock();
    expect(result).toEqual({ ok: true });
    expect(existsSync(lockFile)).toBe(true);
    releaseInitLock();
    expect(existsSync(lockFile)).toBe(false);
  });

  it('acquireInitLock returns { ok: false, stale: false } when a LIVE PID holds the lock', async () => {
    const { acquireInitLock } = await import('../src/lib/lock.js');
    // Write the current process PID — guaranteed live
    writeFileSync(lockFile, String(process.pid), 'utf8');
    const result = acquireInitLock();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.pid).toBe(process.pid);
      expect(result.stale).toBe(false);
    }
  });

  it('acquireInitLock reclaims ({ ok: true }) when lock file PID is stale', async () => {
    const { acquireInitLock } = await import('../src/lib/lock.js');
    // 999999999 is an almost-certainly unallocated PID on any OS
    writeFileSync(lockFile, '999999999', 'utf8');
    const result = acquireInitLock();
    expect(result).toEqual({ ok: true });
    // Lock file should now contain OUR pid
    const { readFileSync } = await import('node:fs');
    expect(Number(readFileSync(lockFile, 'utf8').trim())).toBe(process.pid);
  });

  it('isLockStale returns true for a definitely-dead PID (999999999)', async () => {
    const { isLockStale } = await import('../src/lib/lock.js');
    expect(isLockStale(999999999)).toBe(true);
  });

  it('isLockStale returns false for our own PID (we are alive)', async () => {
    const { isLockStale } = await import('../src/lib/lock.js');
    expect(isLockStale(process.pid)).toBe(false);
  });

  it('releaseInitLock is a no-op when the lock file does not exist', async () => {
    const { releaseInitLock } = await import('../src/lib/lock.js');
    expect(existsSync(lockFile)).toBe(false);
    expect(() => releaseInitLock()).not.toThrow();
  });

  it('releaseInitLock does NOT delete the file when stamped PID is not process.pid', async () => {
    const { releaseInitLock } = await import('../src/lib/lock.js');
    // Write a different (stale) PID — simulates another process owning the lock
    writeFileSync(lockFile, '999999999', 'utf8');
    releaseInitLock();
    // File must still exist because we didn't write it
    expect(existsSync(lockFile)).toBe(true);
  });
});
