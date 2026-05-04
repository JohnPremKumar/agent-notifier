import { checkbox, confirm } from '@inquirer/prompts';
import kleur from 'kleur';
import {
  ConfigStore,
  configFilePath,
  resolveProjectKey,
  projectDisplayName,
  KindSchema,
  type Kind,
  type Config,
} from '@agent-notifier/core';
import { sym, colorOk, colorDim } from './lib/ui.js';

const KINDS: Kind[] = ['PERMISSION', 'IDLE', 'TURN_DONE'];

function tzGuess(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Fallback when Intl is unavailable (sandboxed envs, CI edge cases)
    return 'UTC';
  }
}

function store(): ConfigStore {
  return new ConfigStore(configFilePath(), tzGuess());
}

interface ProjectInfo {
  key: string;
  entry: Config['projects'][string] | undefined;
  displayName: string;
}

function projectFor(c: Config, target: string): ProjectInfo {
  const key = resolveProjectKey(target);
  return { key, entry: c.projects[key], displayName: projectDisplayName(target) };
}

export async function runProjectInteractive(target: string = process.cwd()): Promise<void> {
  const s = store();
  const c = s.load();
  const { key, entry, displayName } = projectFor(c, target);

  console.log(kleur.bold('agent-notifier — project rules') + '\n');
  console.log(`  Project   ${displayName}`);
  console.log(`  Path      ${target}`);
  if (entry) {
    console.log(
      `  Status    ${entry.enabled ? 'enabled' : 'disabled'} · kinds: ${entry.kinds?.join(',') ?? 'all'}`,
    );
  } else {
    console.log(
      `  Status    ${colorDim(`not configured (default: ${c.projectDefault.enabled ? 'enabled' : 'disabled'})`)}`,
    );
  }
  console.log('');

  const enabled = await confirm({
    message: 'Notify for this project?',
    default: entry?.enabled ?? c.projectDefault.enabled,
  });
  const kinds = await checkbox({
    message: 'Which events?',
    choices: KINDS.map((k) => ({
      name: k,
      value: k,
      checked: entry?.kinds ? entry.kinds.includes(k) : true,
    })),
  });

  s.update((cfg) => {
    cfg.projects[key] = {
      enabled,
      // If every kind is selected, store undefined to mean "all" (smaller config, future-proof)
      kinds: kinds.length === KINDS.length ? undefined : kinds,
    };
  });
  console.log(`${colorOk(sym.ok)} saved`);
}

export async function runProjectShow(opts: { project?: string; json?: boolean }): Promise<void> {
  await Promise.resolve();
  const target = opts.project ?? process.cwd();
  const c = store().load();
  const { entry, displayName } = projectFor(c, target);

  if (opts.json) {
    // Use null (not undefined) so the key is always present in the serialized JSON
    console.log(
      JSON.stringify({ project: displayName, path: target, entry: entry ?? null }, null, 2),
    );
    return;
  }

  console.log(`project   ${displayName}`);
  console.log(`path      ${target}`);
  if (entry) {
    console.log(`enabled   ${entry.enabled ? `${colorOk(sym.ok)} yes` : `${sym.fail} no`}`);
    console.log(`kinds     ${entry.kinds?.join(', ') ?? 'all'}`);
  } else {
    // No entry: show the default so users understand why they're seeing notifications
    console.log(`enabled   ${colorDim(`(default: ${c.projectDefault.enabled})`)}`);
    console.log(`kinds     ${colorDim('(default: all)')}`);
  }
}

export async function runProjectSet(opts: {
  enabled?: string;
  kinds?: string;
  project?: string;
}): Promise<void> {
  await Promise.resolve();
  const target = opts.project ?? process.cwd();
  const key = resolveProjectKey(target);
  const enabled = opts.enabled === undefined ? undefined : opts.enabled === 'true';
  // KindSchema.parse throws a ZodError on unknown values — satisfies the "invalid kind" contract
  const kinds =
    !opts.kinds || opts.kinds === 'all'
      ? undefined
      : opts.kinds.split(',').map((k) => KindSchema.parse(k.trim()));

  store().update((c) => {
    const cur = c.projects[key] ?? { enabled: c.projectDefault.enabled };
    c.projects[key] = { enabled: enabled ?? cur.enabled, kinds };
  });
  console.log(`${colorOk(sym.ok)} updated ${key}`);
}

export async function runProjectClear(opts: { project?: string; yes?: boolean }): Promise<void> {
  const target = opts.project ?? process.cwd();
  const key = resolveProjectKey(target);
  if (!opts.yes) {
    const ok = await confirm({ message: `Remove rules for ${key}?`, default: true });
    if (!ok) return;
  }
  store().update((c) => {
    delete c.projects[key];
  });
  console.log(`${colorOk(sym.ok)} cleared ${key}`);
}

export async function runProjectList(opts: { json?: boolean }): Promise<void> {
  await Promise.resolve();
  const c = store().load();
  if (opts.json) {
    console.log(JSON.stringify(c.projects, null, 2));
    return;
  }
  const keys = Object.keys(c.projects);
  if (keys.length === 0) {
    console.log(colorDim('(no projects configured)'));
    return;
  }
  for (const k of keys) {
    const e = c.projects[k]!;
    const status = e.enabled ? colorOk(`${sym.ok} enabled `) : `${sym.fail} disabled`;
    const kindStr = e.kinds?.join(',') ?? 'all kinds';
    console.log(`${k.padEnd(60)}  ${status}  ${kindStr}`);
  }
}
