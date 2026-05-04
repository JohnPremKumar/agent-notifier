// packages/core/tests/platform.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>(); // eslint-disable-line @typescript-eslint/consistent-type-imports
  return { ...actual, homedir: vi.fn(() => actual.homedir()) };
});

describe('platform', () => {
  const origPlatform = process.platform;
  const origAppData = process.env['APPDATA'];

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true });
    process.env['APPDATA'] = origAppData;
    vi.resetModules();
  });

  it('configDir returns ~/.agent-notifier on macOS', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const os = await import('node:os');
    vi.mocked(os.homedir).mockReturnValue('/Users/x');
    const { configDir } = await import('../src/platform.js');
    expect(configDir()).toBe('/Users/x/.agent-notifier');
  });

  it('configDir returns %APPDATA%\\.agent-notifier on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env['APPDATA'] = 'C:\\Users\\x\\AppData\\Roaming';
    const { configDir } = await import('../src/platform.js');
    expect(configDir()).toBe('C:\\Users\\x\\AppData\\Roaming\\.agent-notifier');
  });

  it('isSupportedPlatform is true on darwin and win32, false elsewhere', async () => {
    const { isSupportedPlatform } = await import('../src/platform.js');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(isSupportedPlatform()).toBe(true);
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(isSupportedPlatform()).toBe(true);
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(isSupportedPlatform()).toBe(false);
  });
});
