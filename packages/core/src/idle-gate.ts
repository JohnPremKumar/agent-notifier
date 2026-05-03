import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(execCb);

export type ExecFn = (
  cmd: string,
  opts?: { timeout?: number },
) => Promise<{ stdout: string; stderr: string }>;

export interface GetIdleOptions {
  exec?: ExecFn;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
}

export function parseIoregOutput(raw: string): number {
  const match = raw.match(/"HIDIdleTime"\s*=\s*(\d+)/);
  if (!match?.[1]) throw new Error('HIDIdleTime not found in ioreg output');
  return Math.floor(Number(match[1]) / 1_000_000_000);
}

export function parsePowerShellOutput(raw: string): number {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!Number.isFinite(n)) throw new Error(`Non-numeric PowerShell output: ${trimmed}`);
  return Math.floor(n);
}

const MAC_CMD = "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print; exit}'";
const WIN_CMD =
  'powershell -NoProfile -Command "' +
  "Add-Type 'using System; using System.Runtime.InteropServices; " +
  'public class I { [DllImport(\\"user32.dll\\")] public static extern bool GetLastInputInfo(ref L l); ' +
  "public struct L { public uint cb; public uint t; } }';" +
  '$l = New-Object I+L; $l.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($l); ' +
  '[I]::GetLastInputInfo([ref]$l) | Out-Null;' +
  '[Math]::Floor(([Environment]::TickCount - $l.t) / 1000)"';

export async function getIdleSeconds(opts: GetIdleOptions = {}): Promise<number> {
  const exec = opts.exec ?? execAsync;
  const platform = opts.platform ?? process.platform;
  const timeout = opts.timeoutMs ?? 200;
  try {
    if (platform === 'darwin') {
      const { stdout } = await exec(MAC_CMD, { timeout });
      return parseIoregOutput(stdout);
    }
    if (platform === 'win32') {
      const { stdout } = await exec(WIN_CMD, { timeout });
      return parsePowerShellOutput(stdout);
    }
    return Infinity;
  } catch {
    return Infinity; // fail-open: treat user as idle so we don't swallow notifications
  }
}
