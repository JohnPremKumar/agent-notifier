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

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'fish', 'dash']);
const AI_EXES: ReadonlySet<string> = new Set(['claude', 'codex', 'gemini', 'opencode']);
const TERMINAL_EXES: ReadonlySet<string> = new Set([
  'Terminal',
  'iTerm2',
  'Ghostty',
  'WezTerm',
  'Alacritty',
  'kitty',
  'Hyper',
  'Warp',
  'Code',
  'Cursor',
  'Windsurf',
  'Zed',
]);
const MAX_DEPTH = 8;

// Strip any path prefix so set membership checks (SHELLS/AI_EXES/TERMINAL_EXES)
// stay simple even when ps -o comm= returns an absolute path (macOS does this
// for non-shell processes).
function basename(comm: string): string {
  const trimmed = comm.trim();
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export async function getProcessComm(pid: number, opts: GetIdleOptions = {}): Promise<string> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o comm= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function getProcessPpid(pid: number, opts: GetIdleOptions = {}): Promise<number | null> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o ppid= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function getProcessTty(pid: number, opts: GetIdleOptions = {}): Promise<string | null> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o tty= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    const t = stdout.trim();
    return t && t !== '??' ? t : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the AI tool's PID from the hook's parent PID, hopping past intermediate shells.
 *
 * Why shell-hop: Claude Code allows hooks invoked as `bash -c "agent-notifier hook ..."`.
 * In that case process.ppid points at bash, not claude. We walk up while comm matches a
 * known shell (bash/sh/zsh/fish/dash) until we find an AI tool exe. Bounded at MAX_DEPTH
 * to defend against pathological process trees.
 *
 * Returns null if no AI tool found in the chain.
 */
export async function resolveAiPid(
  startPid: number,
  opts: GetIdleOptions = {},
): Promise<number | null> {
  let pid: number | null = startPid;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (pid === null || pid <= 1) return null;
    const comm = await getProcessComm(pid, opts);
    const base = basename(comm);
    if (AI_EXES.has(base)) return pid;
    // First iteration always proceeds (start can be the wrapper itself, e.g. agent-notifier).
    // Subsequent iterations require a shell hop; anything else means we've left the AI's
    // descendant chain and should give up rather than walk into unrelated parents.
    if (i > 0 && !SHELLS.has(base)) return null;
    pid = await getProcessPpid(pid, opts);
  }
  return null;
}

/**
 * Walk up from the given PID until we find a known terminal emulator's exe name (e.g.
 * "iTerm2", "Ghostty"). Returns the comm basename of the terminal, or null if no terminal
 * is found within MAX_DEPTH levels.
 */
export async function walkUpToTerminal(
  startPid: number,
  opts: GetIdleOptions = {},
): Promise<string | null> {
  let pid: number | null = startPid;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (pid === null || pid <= 1) return null;
    const comm = await getProcessComm(pid, opts);
    const base = basename(comm);
    if (TERMINAL_EXES.has(base)) return base;
    pid = await getProcessPpid(pid, opts);
  }
  return null;
}
