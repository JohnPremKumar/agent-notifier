import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { OPENCODE_PLUGIN_SOURCE, type ToolName } from '@agent-notifier/core';

export function createOpenCodeInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const dir = join(home, '.config', 'opencode', 'plugins');
  const file = join(dir, 'agent-notifier.js');
  const name: ToolName = 'opencode';

  return {
    name,
    async detect(): Promise<boolean> { return existsSync(dir); },
    async isWired(): Promise<boolean> { return existsSync(file); },
    async install(): Promise<void> {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, OPENCODE_PLUGIN_SOURCE, 'utf8');
    },
    async uninstall(): Promise<void> {
      if (existsSync(file)) unlinkSync(file);
    },
  };
}
