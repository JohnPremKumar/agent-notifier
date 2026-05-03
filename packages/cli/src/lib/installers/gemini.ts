import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolName } from '@agent-notifier/core';

const MARK = 'agent-notifier hook --tool gemini';
const EVENTS = ['Notification', 'AfterAgent'] as const;

interface HookCmd {
  command: string;
}
type Hooks = Record<string, HookCmd[]>;

export function createGeminiInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const file = join(home, '.gemini', 'settings.json');
  const bak = `${file}.agent-notifier.bak`;
  const name: ToolName = 'gemini';

  function read(): Record<string, unknown> {
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  }

  return {
    name,
    detect(): Promise<boolean> {
      return Promise.resolve(existsSync(join(home, '.gemini')));
    },

    isWired(): Promise<boolean> {
      const s = read();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      return Promise.resolve(
        EVENTS.every((e) => (hooks[e] ?? []).some((h) => h.command.includes(MARK))),
      );
    },

    install(): Promise<void> {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
      const s = read();
      const hooks: Hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const e of EVENTS) {
        hooks[e] = hooks[e] ?? [];
        if (!hooks[e].some((h) => h.command.includes(MARK))) {
          hooks[e].push({ command: MARK });
        }
      }
      s['hooks'] = hooks;
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
      renameSync(tmp, file);
      return Promise.resolve();
    },

    uninstall(): Promise<void> {
      if (existsSync(bak)) {
        copyFileSync(bak, file);
        unlinkSync(bak);
        return Promise.resolve();
      }
      const s = read();
      const hooks = (s['hooks'] as Hooks | undefined) ?? {};
      for (const e of EVENTS) {
        hooks[e] = (hooks[e] ?? []).filter((h) => !h.command.includes(MARK));
        if (hooks[e].length === 0) delete hooks[e];
      }
      s['hooks'] = hooks;
      writeFileSync(file, JSON.stringify(s, null, 2), 'utf8');
      return Promise.resolve();
    },
  };
}
