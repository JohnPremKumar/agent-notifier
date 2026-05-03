import kleur from 'kleur';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ConfigStore,
  configFilePath,
  configDir,
  getIdleSeconds,
  loggerFromConfig,
  logDir,
  resolveProjectKey,
} from '@agent-notifier/core';
import { allInstallers } from './install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = (
  JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
).version;

export async function runStatus(): Promise<void> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const store = new ConfigStore(configFilePath(), tz);
  const c = store.load();
  console.log(kleur.bold(`agent-notifier ${VERSION} · ${process.platform} · ${configDir()}`));
  console.log('');
  console.log(
    `Global:        ${c.global.enabled ? kleur.green('enabled') : kleur.red('disabled')}`,
  );
  console.log(`Muted:         ${c.mute ? kleur.yellow(`until ${c.mute.until}`) : 'no'}`);

  if (c.schedules.length === 0) console.log(`Schedules:     ${kleur.gray('(none)')}`);
  else {
    console.log(`Schedules:`);
    for (const s of c.schedules)
      console.log(`  [${s.id}] ${s.type} ${s.days.join(',')} ${s.from}-${s.to}`);
  }

  process.stdout.write('Tools:         ');
  const installers = allInstallers();
  const tools: string[] = [];
  for (const inst of installers) {
    const wired = (await inst.detect()) ? await inst.isWired() : false;
    const enabled = c.tools[inst.name]?.enabled ?? true;
    const sym = !wired ? kleur.gray('✗') : enabled ? kleur.green('✓') : kleur.yellow('○');
    tools.push(`${sym} ${inst.name}`);
  }
  console.log(tools.join('   '));

  const projKey = resolveProjectKey(process.cwd());
  const proj = c.projects[projKey];
  console.log(`Current dir:   ${process.cwd()}`);
  if (proj) {
    console.log(
      `Project:       ${proj.enabled ? kleur.green('enabled') : kleur.red('disabled')}${proj.kinds ? ` · kinds: ${proj.kinds.join(',')}` : ' · all kinds'}`,
    );
  } else {
    console.log(
      `Project:       ${kleur.gray(`(not configured; default ${c.projectDefault.enabled ? 'enabled' : 'disabled'})`)}`,
    );
  }

  const idle = await getIdleSeconds();
  console.log(`Idle gate:     ON (last activity ${idle === Infinity ? '?' : `${idle}s ago`})`);

  const log = loggerFromConfig(c, logDir());
  const tail = log.readTail(5);
  if (tail.length > 0) {
    console.log('\nRecent (last 5):');
    for (const t of tail) {
      console.log(
        `  ${t.ts}  ${t.kind.padEnd(10)} ${t.project.padEnd(16)} ${t.tool.padEnd(12)} ${t.fired ? kleur.green('fired') : kleur.gray(`suppressed (${t.suppressReason ?? '?'})`)}`,
      );
    }
  }
}
