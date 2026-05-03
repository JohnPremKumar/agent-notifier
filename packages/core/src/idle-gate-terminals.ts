/**
 * Centralized terminal classification + per-terminal active-tab lookup.
 *
 * Two purposes:
 * 1. isTerminalBundle / isTerminalProcess — "is the frontmost app a known terminal?"
 *    Used by the idle-gate to decide whether to suppress (terminal frontmost) or fire
 *    (some other app frontmost).
 * 2. getTabLookupForBundle — for terminals that expose active-tab focus, returns an
 *    async lookup function. Terminals without such an API return undefined and the
 *    gate falls through to config.idleGate.unsupportedTerminalPolicy.
 *
 * VSCode/Cursor/Windsurf are listed as terminal bundles (frontmost detection) but
 * deliberately NOT in the lookup table on macOS — `ps E` env access is truncated and
 * there's no portable way to map a child shell to its owning VSCode window. Per spec
 * §8.2 they fall through to policy (b). Windows support for editor-host terminals
 * lands in a later phase.
 */

export type ExecResult = { stdout: string; stderr: string };
export type ExecFn = (cmd: string, opts?: { timeout?: number }) => Promise<ExecResult>;
export type TabLookup = (exec: ExecFn) => Promise<string | null>;

const TERMINAL_BUNDLES_DARWIN: ReadonlySet<string> = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'dev.warp.Warp-Stable',
  'com.mitchellh.ghostty',
  'co.zeit.hyper',
  'net.kovidgoyal.kitty',
  'com.github.wez.wezterm',
  'org.alacritty',
  'com.microsoft.VSCode',
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.exafunction.windsurf',
  'dev.zed.Zed',
]);

const TERMINAL_PROCESSES_WIN32: ReadonlySet<string> = new Set([
  'WindowsTerminal.exe',
  'wt.exe',
  'pwsh.exe',
  'powershell.exe',
  'cmd.exe',
  'ConEmu64.exe',
  'ConEmuC64.exe',
  'cmder.exe',
  'mintty.exe',
  'Code.exe',
  'Cursor.exe',
  'Windsurf.exe',
]);

// `ps -o comm=` basenames for the same set of supported terminals on macOS/Linux.
// Used by the process-tree walk (walkUpToTerminal) — distinct shape from bundle ids
// (frontmost detection) but the same conceptual list of "terminals we recognize".
export const TERMINAL_COMMS_POSIX: ReadonlySet<string> = new Set([
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

export function isTerminalBundle(bundle: string): boolean {
  return TERMINAL_BUNDLES_DARWIN.has(bundle);
}

export function isTerminalProcess(name: string): boolean {
  return TERMINAL_PROCESSES_WIN32.has(name);
}

export function isTerminalComm(comm: string): boolean {
  return TERMINAL_COMMS_POSIX.has(comm);
}

const TAB_LOOKUP_DARWIN: Readonly<Record<string, TabLookup>> = {
  'com.apple.Terminal': async (exec) => {
    const { stdout } = await exec(
      `osascript -e 'tell application "Terminal" to get tty of selected tab of front window'`,
      { timeout: 200 },
    );
    return stdout.trim() || null;
  },
  'com.googlecode.iterm2': async (exec) => {
    const { stdout } = await exec(
      `osascript -e 'tell application "iTerm2" to tty of current session of current window'`,
      { timeout: 200 },
    );
    return stdout.trim() || null;
  },
};

export function getTabLookupForBundle(bundle: string): TabLookup | undefined {
  return TAB_LOOKUP_DARWIN[bundle];
}
