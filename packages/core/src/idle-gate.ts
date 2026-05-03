import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { isTerminalComm, isTerminalBundle, getTabLookupForBundle } from './idle-gate-terminals.js';
import type { Config, Kind } from './types.js';

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
const MAX_DEPTH = 8;

// Strip any path prefix so set membership checks (SHELLS/AI_EXES/isTerminalComm)
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

export async function getProcessPpid(
  pid: number,
  opts: GetIdleOptions = {},
): Promise<number | null> {
  const exec = opts.exec ?? execAsync;
  try {
    const { stdout } = await exec(`ps -o ppid= -p ${pid}`, { timeout: opts.timeoutMs ?? 200 });
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function getProcessTty(
  pid: number,
  opts: GetIdleOptions = {},
): Promise<string | null> {
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
    if (isTerminalComm(base)) return base;
    pid = await getProcessPpid(pid, opts);
  }
  return null;
}

const MAC_FRONTMOST_CMD = `osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'`;
const WIN_FRONTMOST_CMD =
  'powershell -NoProfile -Command "' +
  "Add-Type 'using System; using System.Runtime.InteropServices; " +
  'public class W { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); ' +
  '[DllImport(\\"user32.dll\\")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p); }\';' +
  '$h = [W]::GetForegroundWindow(); $p = 0; [W]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null; ' +
  '(Get-Process -Id $p).ProcessName"';

/**
 * Return the bundle identifier (macOS) or process name with ".exe" suffix (Windows) of the
 * currently frontmost application. Returns null on unsupported platforms or when the OS-level
 * query fails.
 *
 * darwin:  uses osascript + System Events; returns e.g. "com.googlecode.iterm2"
 * win32:   uses PowerShell + GetForegroundWindow; returns e.g. "WindowsTerminal.exe"
 *          (the ".exe" suffix makes the value directly comparable to TERMINAL_PROCESSES_WIN32)
 */
export async function getFrontmostBundle(opts: GetIdleOptions = {}): Promise<string | null> {
  const exec = opts.exec ?? execAsync;
  const platform = opts.platform ?? process.platform;
  const timeout = opts.timeoutMs ?? 200;
  try {
    if (platform === 'darwin') {
      const { stdout } = await exec(MAC_FRONTMOST_CMD, { timeout });
      const v = stdout.trim();
      return v || null;
    }
    if (platform === 'win32') {
      const { stdout } = await exec(WIN_FRONTMOST_CMD, { timeout });
      const v = stdout.trim();
      return v ? `${v}.exe` : null;
    }
    return null;
  } catch {
    return null; // fail-open: treat frontmost as unknown so we don't swallow notifications
  }
}

// ---------------------------------------------------------------------------
// Gate decision tree
// ---------------------------------------------------------------------------

export type GateDecision =
  | 'permission-bypass'
  | 'frontmost-other-app'
  | 'frontmost-different-tab'
  | 'frontmost-same-tab'
  | 'unsupported-terminal-fired'
  | 'unsupported-terminal-gated'
  | 'fail-open';

export interface GateResult {
  fire: boolean;
  reason: GateDecision;
}

interface CacheEntry {
  value: GateResult;
  ts: number;
}
const gateCache: Map<string, CacheEntry> = new Map();
const CACHE_MS = 2_000;

export function clearGateCache(): void {
  gateCache.clear();
}

/**
 * Top-level gate decision: should the notification fire?
 *
 * Order:
 *   1. PERMISSION events always fire (trust contract — never suppress a permission ask).
 *   2. always-fire mode short-circuits without any OS probe.
 *   3. Cache check: same (kind, hookPpid, mode) within 2s returns the cached result.
 *   4. strict-os-idle: only consults ioreg/PowerShell idle time.
 *   5. fire-elsewhere / strict-terminal: full process-tree + frontmost walk.
 *
 * Fail-open: any unhandled OS-probe failure returns fire=true so we never swallow a
 * notification silently. The generic catch here is intentional and documented.
 */
export async function decideGate(
  config: Config,
  kind: Kind,
  hookPpid: number,
  opts: GetIdleOptions = {},
): Promise<GateResult> {
  if (kind === 'PERMISSION') return { fire: true, reason: 'permission-bypass' };

  const mode = config.idleGate.mode;
  if (mode === 'always-fire') return { fire: true, reason: 'frontmost-other-app' };

  const cacheKey = `${kind}:${hookPpid}:${mode}`;
  const hit = gateCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.value;

  let result: GateResult;
  try {
    if (mode === 'strict-os-idle') {
      const idle = await getIdleSeconds(opts);
      result =
        idle >= config.idleGate.thresholdSeconds
          ? { fire: true, reason: 'frontmost-other-app' }
          : { fire: false, reason: 'frontmost-same-tab' };
    } else {
      result = await decideFireElsewhere(config, hookPpid, mode, opts);
    }
  } catch {
    // fail-open: any unhandled OS-probe failure → fire so we don't swallow notifications
    result = { fire: true, reason: 'fail-open' };
  }
  gateCache.set(cacheKey, { value: result, ts: Date.now() });
  return result;
}

async function decideFireElsewhere(
  config: Config,
  hookPpid: number,
  mode: 'fire-elsewhere' | 'strict-terminal',
  opts: GetIdleOptions,
): Promise<GateResult> {
  const aiPid = await resolveAiPid(hookPpid, opts);
  if (aiPid === null) return { fire: true, reason: 'fail-open' };

  const aiTty = await getProcessTty(aiPid, opts);
  if (aiTty === null) return { fire: true, reason: 'fail-open' };

  const aiTerminalExe = await walkUpToTerminal(aiPid, opts);
  if (aiTerminalExe === null) return { fire: true, reason: 'fail-open' };

  const frontmost = await getFrontmostBundle(opts);
  if (frontmost === null) return { fire: true, reason: 'fail-open' };

  if (!isTerminalBundle(frontmost)) return { fire: true, reason: 'frontmost-other-app' };

  if (mode === 'strict-terminal') {
    const idle = await getIdleSeconds(opts);
    return idle >= config.idleGate.thresholdSeconds
      ? { fire: true, reason: 'frontmost-different-tab' }
      : { fire: false, reason: 'frontmost-same-tab' };
  }

  const lookup = getTabLookupForBundle(frontmost);
  if (!lookup) {
    return config.idleGate.unsupportedTerminalPolicy === 'fire'
      ? { fire: true, reason: 'unsupported-terminal-fired' }
      : applyOsIdleGate(config, opts, 'unsupported-terminal-gated');
  }
  const activeTabTty = await lookup(opts.exec ?? execAsync);
  if (activeTabTty === null) return { fire: true, reason: 'fail-open' };
  return activeTabTty === aiTty
    ? { fire: false, reason: 'frontmost-same-tab' }
    : { fire: true, reason: 'frontmost-different-tab' };
}

async function applyOsIdleGate(
  config: Config,
  opts: GetIdleOptions,
  gatedReason: GateDecision,
): Promise<GateResult> {
  const idle = await getIdleSeconds(opts);
  return idle >= config.idleGate.thresholdSeconds
    ? { fire: true, reason: 'frontmost-different-tab' }
    : { fire: false, reason: gatedReason };
}
