import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fireNotification, resolveAssets, type Notifier } from '../src/notify.js';
import { defaultConfig } from '../src/config.js';
import type { Event } from '../src/types.js';

const ev = (overrides: Partial<Event> = {}): Event => ({
  kind: 'TURN_DONE',
  tool: 'claude-code',
  project: 'demo',
  sessionId: 's1',
  cwd: '/x',
  ...overrides,
});

const stubNotifier = (): { calls: unknown[]; notifier: Notifier } => {
  const calls: unknown[] = [];
  return {
    calls,
    notifier: {
      notify: (opts: unknown) => {
        calls.push(opts);
        return Promise.resolve();
      },
    },
  };
};

// ─── resolveAssets ───────────────────────────────────────────────────────────

describe('resolveAssets', () => {
  it('default config + darwin → Ping sound, icon ends with icon.png or icon.icns', () => {
    const cfg = defaultConfig('UTC');
    const { sound, icon } = resolveAssets(cfg, 'darwin');
    expect(sound).toBe('Ping');
    expect(icon).toMatch(/icon\.(png|icns)$/);
  });

  it('default config + win32 → ms-winsoundevent sound, icon ends with icon.ico', () => {
    const cfg = defaultConfig('UTC');
    const { sound, icon } = resolveAssets(cfg, 'win32');
    expect(sound).toMatch(/^ms-winsoundevent:/);
    expect(icon).toMatch(/icon\.ico$/);
  });

  it('custom absolute sound path passes through unchanged', () => {
    const cfg = defaultConfig('UTC');
    cfg.sound.darwin = '/Users/me/sounds/custom.aiff';
    const { sound } = resolveAssets(cfg, 'darwin');
    expect(sound).toBe('/Users/me/sounds/custom.aiff');
  });

  it('custom icon path that does not exist falls back to bundled icon', () => {
    const cfg = defaultConfig('UTC');
    cfg.icon.darwin = '/tmp/does-not-exist-agent-notifier-icon.png';
    const { icon } = resolveAssets(cfg, 'darwin');
    // Should fall back to bundled — path ends with icon.png or icon.icns
    expect(icon).toMatch(/icon\.(png|icns)$/);
    // Must NOT be the missing custom path
    expect(icon).not.toBe('/tmp/does-not-exist-agent-notifier-icon.png');
  });

  let tmpIconPath: string;
  beforeEach(() => {
    tmpIconPath = join(tmpdir(), `agent-notifier-test-icon-${Date.now()}.png`);
  });
  afterEach(() => {
    try {
      unlinkSync(tmpIconPath);
    } catch {
      /* already deleted or never created */
    }
  });

  it('custom icon path that exists passes through unchanged', () => {
    writeFileSync(tmpIconPath, 'fake-png-data');
    const cfg = defaultConfig('UTC');
    cfg.icon.darwin = tmpIconPath;
    const { icon } = resolveAssets(cfg, 'darwin');
    expect(icon).toBe(tmpIconPath);
  });
});

// ─── fireNotification – single sound across all Kinds (darwin) ───────────────

describe('fireNotification (darwin) — single sound', () => {
  it('PERMISSION uses Ping sound (not Sosumi)', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'PERMISSION' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['sound']).toBe('Ping');
  });

  it('IDLE uses Ping sound (not Tink)', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'IDLE' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['sound']).toBe('Ping');
  });

  it('TURN_DONE uses Ping sound (not Glass)', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'TURN_DONE' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['sound']).toBe('Ping');
  });

  it('PERMISSION is sticky (wait=true)', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'PERMISSION' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['wait']).toBe(true);
    expect(c['timeout']).toBe(0);
  });

  it('IDLE is non-sticky (wait=false, timeout=10)', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'IDLE' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['wait']).toBe(false);
    expect(c['timeout']).toBe(10);
  });

  it('TURN_DONE is non-sticky (wait=false, timeout=10)', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'TURN_DONE' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['wait']).toBe(false);
    expect(c['timeout']).toBe(10);
  });

  it('body includes project name and tool', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'PERMISSION', project: 'my-app', tool: 'claude-code' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['message'])).toContain('my-app');
    expect(String(c['message'])).toContain('claude-code');
  });

  it('icon is passed via contentImage on mac', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'TURN_DONE' }), {
      config: cfg,
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['contentImage']).toBeDefined();
    expect(String(c['contentImage'])).toMatch(/icon\.(png|icns)$/);
    expect(c['appIcon']).toBeUndefined();
  });
});

// ─── fireNotification – single sound across all Kinds (win32) ────────────────

describe('fireNotification (win32) — single sound', () => {
  it('PERMISSION uses Notification.Default sound and scenario=alarm', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'PERMISSION' }), {
      config: cfg,
      platform: 'win32',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['sound'])).toContain('ms-winsoundevent');
    expect(String(c['sound'])).toContain('Notification.Default');
    expect(c['scenario']).toBe('alarm');
  });

  it('IDLE uses Notification.Default sound and scenario=reminder', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'IDLE' }), {
      config: cfg,
      platform: 'win32',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['sound'])).toContain('ms-winsoundevent');
    expect(String(c['sound'])).toContain('Notification.Default');
    expect(c['scenario']).toBe('reminder');
  });

  it('TURN_DONE uses Notification.Default sound and scenario=reminder', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'TURN_DONE' }), {
      config: cfg,
      platform: 'win32',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['sound'])).toContain('ms-winsoundevent');
    expect(String(c['sound'])).toContain('Notification.Default');
    expect(c['scenario']).toBe('reminder');
  });

  it('icon is passed via appIcon on win32', async () => {
    const { calls, notifier } = stubNotifier();
    const cfg = defaultConfig('UTC');
    await fireNotification(ev({ kind: 'TURN_DONE' }), {
      config: cfg,
      platform: 'win32',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['appIcon']).toBeDefined();
    expect(String(c['appIcon'])).toMatch(/icon\.ico$/);
    expect(c['contentImage']).toBeUndefined();
  });
});
