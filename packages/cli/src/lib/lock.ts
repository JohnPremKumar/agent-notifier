import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '@agent-notifier/core';

const LOCK_NAME = '.init.lock';

export function lockPath(): string {
  return join(configDir(), LOCK_NAME);
}

// `process.kill(pid, 0)` doesn't actually send a signal — it tests whether the
// PID is reachable. Throws ESRCH if the process doesn't exist (= stale).
// The throw from an unreachable PID is the API contract — we catch it to return true.
export function isLockStale(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    // ESRCH (no such process) or EPERM (not our process, but it exists) both
    // indicate the PID is either dead or unowned — treat as stale in both cases.
    // EPERM means the PID IS alive but owned by another user; we cannot steal it,
    // so calling it stale lets acquireInitLock skip overwriting it safely.
    return true;
  }
}

export type LockResult = { ok: true } | { ok: false; pid: number; stale: boolean };

export function acquireInitLock(): LockResult {
  const f = lockPath();
  if (existsSync(f)) {
    const pid = Number(readFileSync(f, 'utf8').trim());
    if (Number.isFinite(pid) && !isLockStale(pid)) {
      return { ok: false, pid, stale: false };
    }
    // stale → fall through and reclaim
  }
  writeFileSync(f, String(process.pid), 'utf8');
  return { ok: true };
}

// Defensive: only delete if WE wrote this lock. Prevents one init from
// clobbering another's lock if PIDs were ever recycled mid-flight.
export function releaseInitLock(): void {
  const f = lockPath();
  if (!existsSync(f)) return;
  try {
    const pid = Number(readFileSync(f, 'utf8').trim());
    if (pid === process.pid) unlinkSync(f);
  } catch {
    // best-effort: if the file disappeared between existsSync and unlinkSync,
    // or the read fails, we silently ignore — release is advisory cleanup only.
  }
}
