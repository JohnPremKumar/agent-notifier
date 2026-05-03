import { ConfigStore, configFilePath, resolveProjectKey, ToolNameSchema } from '@agent-notifier/core';
import kleur from 'kleur';

export interface EnableOpts { global?: boolean; project?: string | true; tool?: string; }

export async function runEnable(opts: EnableOpts): Promise<void> { await applyToggle(opts, true); }

export async function applyToggle(opts: EnableOpts, enabled: boolean): Promise<void> {
  const store = new ConfigStore(configFilePath(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (opts.global) {
    store.update((c) => { c.global.enabled = enabled; });
    console.log(`${kleur.green(enabled ? '✓' : '✗')} global ${enabled ? 'enabled' : 'disabled'}`);
    return;
  }
  if (opts.tool) {
    const tool = ToolNameSchema.parse(opts.tool);
    store.update((c) => { c.tools[tool] = { enabled }; });
    console.log(`${kleur.green(enabled ? '✓' : '✗')} tool ${tool} ${enabled ? 'enabled' : 'disabled'}`);
    return;
  }
  // project (default)
  const target = typeof opts.project === 'string' ? opts.project : process.cwd();
  const key = resolveProjectKey(target);
  store.update((c) => { c.projects[key] = { enabled }; });
  console.log(`${kleur.green(enabled ? '✓' : '✗')} project ${key} ${enabled ? 'enabled' : 'disabled'}`);
}
