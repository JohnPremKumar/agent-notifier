import notifierLib from 'node-notifier';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config, Event, Kind } from './types.js';

// notify.js runs from packages/core/dist/ at runtime.
// Bundled icons are at packages/core/assets/ (copied by tsup onSuccess).
// So dist/../assets/icon.* is the canonical resolution path.
const here = dirname(fileURLToPath(import.meta.url));
const BUNDLED = {
  darwin: resolve(here, '../assets/icon.png'),
  win32: resolve(here, '../assets/icon.ico'),
};

const DEFAULT_SOUND: Record<'darwin' | 'win32', string> = {
  darwin: 'Ping',
  win32: 'ms-winsoundevent:Notification.Default',
};

export interface ResolvedAssets {
  sound: string;
  icon: string;
}

export function resolveAssets(config: Config, platform: NodeJS.Platform): ResolvedAssets {
  const platformKey: 'darwin' | 'win32' = platform === 'win32' ? 'win32' : 'darwin';
  const configuredSound = config.sound[platformKey];
  const sound = configuredSound || DEFAULT_SOUND[platformKey];

  const customIcon = config.icon[platformKey];
  const bundled = BUNDLED[platformKey];
  const icon = customIcon && existsSync(customIcon) ? customIcon : bundled;

  return { sound, icon };
}

interface KindMeta {
  title: string;
  sticky: boolean;
}

const KINDS: Record<Kind, KindMeta> = {
  PERMISSION: { title: 'Claude needs approval', sticky: true },
  IDLE: { title: 'Agent is idle', sticky: false },
  TURN_DONE: { title: 'Agent is done', sticky: false },
};

export interface Notifier {
  notify: (opts: Record<string, unknown>) => Promise<void>;
}

export interface FireOptions {
  config: Config;
  platform?: NodeJS.Platform;
  notifier?: Notifier;
}

const defaultNotifier: Notifier = {
  notify: (opts) =>
    new Promise((resolveP) => {
      notifierLib.notify(opts, () => resolveP());
    }),
};

export async function fireNotification(event: Event, opts: FireOptions): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const n = opts.notifier ?? defaultNotifier;
  const cfg = KINDS[event.kind];
  const { sound, icon } = resolveAssets(opts.config, platform);
  const body = `${event.project} · ${event.tool}${event.message ? ` · ${event.message.slice(0, 80)}` : ''}`;

  if (platform === 'win32') {
    await n.notify({
      title: cfg.title,
      message: body,
      sound,
      appIcon: icon,
      scenario: cfg.sticky ? 'alarm' : 'reminder',
      timeout: cfg.sticky ? false : 10,
    });
    return;
  }
  await n.notify({
    title: cfg.title,
    message: body,
    sound,
    contentImage: icon,
    wait: cfg.sticky,
    timeout: cfg.sticky ? 0 : 10,
  });
}
