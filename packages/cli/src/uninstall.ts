import kleur from 'kleur';
import { allInstallers } from './install.js';

export async function runUninstall(): Promise<void> {
  for (const inst of allInstallers()) {
    if (await inst.isWired()) {
      await inst.uninstall();
      console.log(`${kleur.green('✓')} ${inst.name} (unwired)`);
    } else {
      console.log(`${kleur.gray('-')} ${inst.name} (not wired)`);
    }
  }
}
