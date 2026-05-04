import { ConfigStore, configFilePath } from '@agent-notifier/core';
import { parseDuration } from './lib/duration.js';
import { sym, colorOk, colorWarn } from './lib/ui.js';

export async function runMute(input: string): Promise<void> {
  await Promise.resolve();
  const until = parseDuration(input);
  const store = new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  store.update((c) => {
    c.mute = { until: until.toISOString() };
  });
  console.log(`${colorWarn(sym.dash)} muted until ${until.toISOString()}`);
}

export async function runUnmute(): Promise<void> {
  await Promise.resolve();
  const store = new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  store.update((c) => {
    c.mute = null;
  });
  console.log(`${colorOk(sym.flow)} unmuted`);
}
