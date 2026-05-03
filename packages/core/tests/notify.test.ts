import { describe, it, expect } from 'vitest';
import { fireNotification, type Notifier } from '../src/notify.js';
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

describe('fireNotification (darwin)', () => {
  it('PERMISSION uses sticky alert + Sosumi sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'PERMISSION', message: 'needs perm' }), {
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(c['title']).toMatch(/approval/i);
    expect(c['sound']).toBe('Sosumi');
    expect(c['wait']).toBe(true); // sticky
  });

  it('IDLE uses banner + Tink sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'IDLE' }), { platform: 'darwin', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['title']).toMatch(/idle/i);
    expect(c['sound']).toBe('Tink');
  });

  it('TURN_DONE uses banner + Glass sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'TURN_DONE' }), { platform: 'darwin', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['sound']).toBe('Glass');
  });

  it('body includes project name and tool', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'PERMISSION', project: 'my-app' }), {
      platform: 'darwin',
      notifier,
    });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['message'])).toContain('my-app');
    expect(String(c['message'])).toContain('claude-code');
  });
});

describe('fireNotification (win32)', () => {
  it('PERMISSION uses scenario=alarm', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'PERMISSION' }), { platform: 'win32', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(c['scenario']).toBe('alarm');
  });

  it('IDLE uses Windows default sound', async () => {
    const { calls, notifier } = stubNotifier();
    await fireNotification(ev({ kind: 'IDLE' }), { platform: 'win32', notifier });
    const c = calls[0] as Record<string, unknown>;
    expect(String(c['sound'])).toContain('ms-winsoundevent');
  });
});
