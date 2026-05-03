import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolName } from '@agent-notifier/core';

export interface ClaudeCodeInstallerOptions { home?: string; }

interface HookEntry { matcher?: string; hooks: Array<{ type: 'command'; command: string }>; }
type Hooks = Record<string, HookEntry[]>;

const MARK = 'agent-notifier';
const EVENTS = ['Notification', 'Stop'] as const;

export function createClaudeCodeInstaller(opts: ClaudeCodeInstallerOptions = {}) {
  const home = opts.home ?? homedir();
  const settings = join(home, '.claude', 'settings.json');
  const bak = `${settings}.agent-notifier.bak`;

  const name: ToolName = 'claude-code';

  function readSettings(): Record<string, unknown> {
    if (!existsSync(settings)) return {};
    return JSON.parse(readFileSync(settings, 'utf8')) as Record<string, unknown>;
  }

  function buildHookEntry(): HookEntry {
    return { hooks: [{ type: 'command', command: `agent-notifier hook --tool claude-code` }] };
  }

  return {
    name,
    async detect(): Promise<boolean> { return existsSync(join(home, '.claude')); },

    async isWired(): Promise<boolean> {
      const s = readSettings();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      return EVENTS.every((evt) => (hooks[evt] ?? []).some((h) => h.hooks.some((x) => x.command.includes(MARK))));
    },

    async install(): Promise<void> {
      mkdirSync(dirname(settings), { recursive: true });
      if (existsSync(settings) && !existsSync(bak)) copyFileSync(settings, bak);
      const s = readSettings();
      const hooks: Hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const evt of EVENTS) {
        hooks[evt] = hooks[evt] ?? [];
        const present = hooks[evt]!.some((h) => h.hooks.some((x) => x.command.includes(MARK)));
        if (!present) hooks[evt]!.push(buildHookEntry());
      }
      s['hooks'] = hooks;
      const tmp = `${settings}.tmp`;
      writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
      renameSync(tmp, settings);
    },

    async uninstall(): Promise<void> {
      if (existsSync(bak)) {
        copyFileSync(bak, settings);
        unlinkSync(bak);
        return;
      }
      const s = readSettings();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const evt of EVENTS) {
        hooks[evt] = (hooks[evt] ?? []).filter((h) => !h.hooks.some((x) => x.command.includes(MARK)));
        if (hooks[evt]!.length === 0) delete hooks[evt];
      }
      s['hooks'] = hooks;
      writeFileSync(settings, JSON.stringify(s, null, 2), 'utf8');
    },
  };
}
