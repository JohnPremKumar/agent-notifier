import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { OPENCODE_PLUGIN_SOURCE, type ToolName } from '@agent-notifier/core';

export function createOpenCodeInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const userConfigDir = join(home, '.config', 'opencode');
  const pluginDir = join(userConfigDir, 'plugins');
  const file = join(pluginDir, 'agent-notifier.js');
  const name: ToolName = 'opencode';

  return {
    name,
    detect(): Promise<boolean> {
      return Promise.resolve(existsSync(userConfigDir));
    },
    isWired(): Promise<boolean> {
      return Promise.resolve(existsSync(file));
    },
    install(): Promise<void> {
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(file, OPENCODE_PLUGIN_SOURCE, 'utf8');
      return Promise.resolve();
    },
    uninstall(): Promise<void> {
      if (existsSync(file)) unlinkSync(file);
      return Promise.resolve();
    },
  };
}
