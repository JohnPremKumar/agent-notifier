import notifierLib from 'node-notifier';
import type { Event, Kind } from './types.js';

export interface Notifier {
  notify: (opts: Record<string, unknown>) => Promise<void>;
}

export interface FireOptions {
  platform?: NodeJS.Platform;
  notifier?: Notifier;
}

const defaultNotifier: Notifier = {
  notify: (opts) =>
    new Promise((resolve) => {
      notifierLib.notify(opts, () => resolve());
    }),
};

interface KindConfig {
  title: string;
  macSound: string;
  winSound: string;
  sticky: boolean;
}

const KINDS: Record<Kind, KindConfig> = {
  PERMISSION: {
    title: 'Claude needs approval',
    macSound: 'Sosumi',
    winSound: 'ms-winsoundevent:Notification.Looping.Alarm',
    sticky: true,
  },
  IDLE: {
    title: 'Agent is idle',
    macSound: 'Tink',
    winSound: 'ms-winsoundevent:Notification.Default',
    sticky: false,
  },
  TURN_DONE: {
    title: 'Agent is done',
    macSound: 'Glass',
    winSound: 'ms-winsoundevent:Notification.IM',
    sticky: false,
  },
};

export async function fireNotification(event: Event, opts: FireOptions = {}): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const n = opts.notifier ?? defaultNotifier;
  const cfg = KINDS[event.kind];
  const body = `${event.project} · ${event.tool}${event.message ? ` · ${event.message.slice(0, 80)}` : ''}`;

  if (platform === 'win32') {
    await n.notify({
      title: cfg.title,
      message: body,
      sound: cfg.winSound,
      scenario: cfg.sticky ? 'alarm' : 'reminder',
      timeout: cfg.sticky ? false : 10,
    });
    return;
  }

  // darwin (and unsupported fallback)
  await n.notify({
    title: cfg.title,
    message: body,
    sound: cfg.macSound,
    wait: cfg.sticky,
    timeout: cfg.sticky ? 0 : 10,
  });
}
