import { homedir } from 'node:os';
import kleur from 'kleur';
import { createClaudeCodeInstaller } from './lib/installers/claude-code.js';
import { createCodexInstaller } from './lib/installers/codex.js';
import { createGeminiInstaller } from './lib/installers/gemini.js';
import { createOpenCodeInstaller } from './lib/installers/opencode.js';
import type { ToolName } from '@agent-notifier/core';

export interface ToolInstaller {
  name: ToolName;
  detect: () => Promise<boolean>;
  isWired: () => Promise<boolean>;
  install: () => Promise<void>;
  uninstall: () => Promise<void>;
}

export function allInstallers(home?: string): ToolInstaller[] {
  const h = home ?? homedir();
  return [
    createClaudeCodeInstaller({ home: h }),
    createCodexInstaller({ home: h }),
    createGeminiInstaller({ home: h }),
    createOpenCodeInstaller({ home: h }),
  ];
}

export async function runInstall(): Promise<void> {
  for (const inst of allInstallers()) {
    if (!(await inst.detect())) {
      console.log(`${kleur.gray('✗')} ${inst.name} (not detected)`);
      continue;
    }
    if (await inst.isWired()) {
      console.log(`${kleur.green('✓')} ${inst.name} (already installed)`);
      continue;
    }
    await inst.install();
    console.log(`${kleur.green('✓')} ${inst.name} (wired)`);
  }
  console.log(kleur.gray("\nNext: run 'agent-notifier doctor' to fire test notifications."));
}
