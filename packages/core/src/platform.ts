import { homedir } from 'node:os';
import path from 'node:path';

export function isSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32';
}

export function configDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (!appData) throw new Error('APPDATA env var not set on Windows');
    return path.win32.join(appData, 'agent-notifier');
  }
  // Use path.posix explicitly: `path.join` resolves to the host OS's
  // separator at module-load time, so on a Windows host with a mocked
  // process.platform=darwin (in tests) it would emit backslashes. POSIX
  // paths are correct for macOS and Linux runtime.
  return path.posix.join(homedir(), '.agent-notifier');
}

export function logDir(): string {
  return path.join(configDir(), 'log');
}

export function backupsDir(): string {
  return path.join(configDir(), 'backups');
}

export function configFilePath(): string {
  return path.join(configDir(), 'config.json');
}
