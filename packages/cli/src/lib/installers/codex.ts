import TOML from '@iarna/toml';
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

const MARK = 'agent-notifier hook --tool codex';
const EVENTS = ['PermissionRequest', 'Stop'] as const;

interface HookCmd {
  command: string;
}
type CodexConfig = { hooks?: Record<string, HookCmd[]>; [k: string]: unknown };

export function createCodexInstaller(opts: { home?: string } = {}) {
  const home = opts.home ?? homedir();
  const file = join(home, '.codex', 'config.toml');
  const bak = `${file}.agent-notifier.bak`;
  const name: ToolName = 'codex';

  function read(): CodexConfig {
    if (!existsSync(file)) return {};
    return TOML.parse(readFileSync(file, 'utf8')) as CodexConfig;
  }

  return {
    name,
    detect(): Promise<boolean> {
      return Promise.resolve(existsSync(join(home, '.codex')));
    },

    isWired(): Promise<boolean> {
      const c = read();
      const hooks = c.hooks ?? {};
      return Promise.resolve(
        EVENTS.every((e) => (hooks[e] ?? []).some((h) => h.command.includes(MARK))),
      );
    },

    install(): Promise<void> {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
      const c = read();
      c.hooks = c.hooks ?? {};
      for (const e of EVENTS) {
        c.hooks[e] = c.hooks[e] ?? [];
        if (!c.hooks[e].some((h) => h.command.includes(MARK))) {
          c.hooks[e].push({ command: MARK });
        }
      }
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, TOML.stringify(c as TOML.JsonMap), 'utf8');
      renameSync(tmp, file);
      return Promise.resolve();
    },

    uninstall(): Promise<void> {
      if (existsSync(bak)) {
        copyFileSync(bak, file);
        unlinkSync(bak);
        return Promise.resolve();
      }
      const c = read();
      const hooks = c.hooks ?? {};
      for (const e of EVENTS) {
        hooks[e] = (hooks[e] ?? []).filter((h) => !h.command.includes(MARK));
        if (hooks[e].length === 0) delete hooks[e];
      }
      c.hooks = hooks;
      writeFileSync(file, TOML.stringify(c as TOML.JsonMap), 'utf8');
      return Promise.resolve();
    },
  };
}
