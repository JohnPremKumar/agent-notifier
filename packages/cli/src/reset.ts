import { input } from '@inquirer/prompts';
import { unlinkSync, existsSync } from 'node:fs';
import kleur from 'kleur';
import { configFilePath, logDir } from '@agent-notifier/core';
import { allInstallers, type ToolInstaller } from './install.js';
import { acquireInitLock, releaseInitLock } from './lib/lock.js';
import { sym, colorOk, colorDim } from './lib/ui.js';

export interface ResetOpts {
  yes?: boolean;
  // Test injection point — defaults to allInstallers() when absent.
  // This avoids needing to mock the entire install module in unit tests.
  _installers?: ToolInstaller[];
}

export async function runReset(opts: ResetOpts = {}): Promise<void> {
  console.log(kleur.bold('agent-notifier — reset') + '\n');
  console.log('  This will:');
  console.log(`    ${sym.dot} uninstall hooks from each wired tool (restores .agent-notifier.bak)`);
  console.log(`    ${sym.dot} delete ${configFilePath()}`);
  console.log(`    ${sym.dot} keep ${logDir()} (your history)`);
  console.log('');

  if (!opts.yes) {
    const c = await input({ message: "Type 'reset' to confirm:" });
    // Case-sensitive exact match — intentional friction for a destructive op.
    if (c.trim() !== 'reset') {
      console.log(colorDim('Aborted.'));
      return;
    }
  }

  const lock = acquireInitLock();
  if (!lock.ok) {
    console.error(`${kleur.yellow(sym.alert)} Another setup is in progress (PID ${lock.pid}).`);
    console.error('  Next: wait for it, or remove ~/.agent-notifier/.init.lock if stale.');
    process.exit(1);
  }

  try {
    const installers = opts._installers ?? allInstallers();
    for (const inst of installers) {
      if (await inst.isWired()) {
        await inst.uninstall();
      }
    }
    // Only delete the config FILE — not the entire configDir().
    // The dir may contain logs/, backups/, lock, and state/ that must survive.
    if (existsSync(configFilePath())) unlinkSync(configFilePath());
    console.log(`${colorOk(sym.ok)} reset complete`);
  } finally {
    releaseInitLock();
  }
}
