import { describe, expect, it } from 'vitest';
import {
  isTerminalBundle,
  isTerminalProcess,
  getTabLookupForBundle,
} from '../src/idle-gate-terminals.js';

describe('idle-gate-terminals', () => {
  it('classifies known terminal bundles on macOS', () => {
    expect(isTerminalBundle('com.apple.Terminal')).toBe(true);
    expect(isTerminalBundle('com.googlecode.iterm2')).toBe(true);
    expect(isTerminalBundle('com.mitchellh.ghostty')).toBe(true);
    expect(isTerminalBundle('dev.warp.Warp-Stable')).toBe(true);
    expect(isTerminalBundle('com.google.Chrome')).toBe(false);
    expect(isTerminalBundle('com.tinyspeck.slackmacgap')).toBe(false);
    expect(isTerminalBundle('')).toBe(false);
  });

  it('classifies known terminal processes on Windows', () => {
    expect(isTerminalProcess('WindowsTerminal.exe')).toBe(true);
    expect(isTerminalProcess('pwsh.exe')).toBe(true);
    expect(isTerminalProcess('cmd.exe')).toBe(true);
    expect(isTerminalProcess('chrome.exe')).toBe(false);
    expect(isTerminalProcess('explorer.exe')).toBe(false);
    expect(isTerminalProcess('')).toBe(false);
  });

  it('returns active-tab lookup function for supported bundles', () => {
    expect(typeof getTabLookupForBundle('com.apple.Terminal')).toBe('function');
    expect(typeof getTabLookupForBundle('com.googlecode.iterm2')).toBe('function');
  });

  it('returns undefined for unsupported bundles (Ghostty, Alacritty, etc.)', () => {
    // Ghostty, Alacritty, Hyper, kitty (no remote-ctrl), VSCode-mac
    // (per spec resolution 1.2: VSCode-mac is unsupported even though it's a terminal bundle).
    expect(getTabLookupForBundle('com.mitchellh.ghostty')).toBeUndefined();
    expect(getTabLookupForBundle('org.alacritty')).toBeUndefined();
    expect(getTabLookupForBundle('co.zeit.hyper')).toBeUndefined();
    expect(getTabLookupForBundle('com.microsoft.VSCode')).toBeUndefined();
    expect(getTabLookupForBundle('com.todesktop.230313mzl4w4u92')).toBeUndefined();
    expect(getTabLookupForBundle('com.exafunction.windsurf')).toBeUndefined();
    expect(getTabLookupForBundle('com.google.Chrome')).toBeUndefined();
  });

  it('Terminal.app lookup invokes osascript and returns the trimmed tty', async () => {
    const fakeExec = (cmd: string) => {
      expect(cmd).toContain('osascript');
      expect(cmd).toContain('Terminal');
      expect(cmd).toContain('selected tab of front window');
      return Promise.resolve({ stdout: '/dev/ttys003\n', stderr: '' });
    };
    const lookup = getTabLookupForBundle('com.apple.Terminal');
    const result = await lookup!(fakeExec);
    expect(result).toBe('/dev/ttys003');
  });

  it('iTerm2 lookup invokes osascript and returns the trimmed tty', async () => {
    const fakeExec = (cmd: string) => {
      expect(cmd).toContain('osascript');
      expect(cmd).toContain('iTerm2');
      expect(cmd).toContain('current session');
      return Promise.resolve({ stdout: '/dev/ttys005\n', stderr: '' });
    };
    const lookup = getTabLookupForBundle('com.googlecode.iterm2');
    const result = await lookup!(fakeExec);
    expect(result).toBe('/dev/ttys005');
  });

  it('lookup returns null on empty stdout', async () => {
    const fakeExec = () => Promise.resolve({ stdout: '', stderr: '' });
    const lookup = getTabLookupForBundle('com.apple.Terminal');
    const result = await lookup!(fakeExec);
    expect(result).toBeNull();
  });
});
