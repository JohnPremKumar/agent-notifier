import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import kleur from 'kleur';
import {
  configDir,
  configFilePath,
  fireNotification,
  Logger,
  logDir,
  type Event,
} from '@agent-notifier/core';
import { allInstallers } from './install.js';

const TEST_EVENTS: Event[] = [
  {
    kind: 'PERMISSION',
    tool: 'claude-code',
    project: '<doctor-test>',
    sessionId: 'doctor',
    cwd: process.cwd(),
    message: 'test permission',
  },
  {
    kind: 'IDLE',
    tool: 'claude-code',
    project: '<doctor-test>',
    sessionId: 'doctor',
    cwd: process.cwd(),
    message: 'test idle',
  },
  {
    kind: 'TURN_DONE',
    tool: 'claude-code',
    project: '<doctor-test>',
    sessionId: 'doctor',
    cwd: process.cwd(),
    message: 'test turn done',
  },
];

function stubNotify(event: Event): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'stub-notifications.jsonl'), JSON.stringify({ event }) + '\n', 'utf8');
}

export async function runDoctor(): Promise<void> {
  console.log(kleur.bold('agent-notifier doctor'));
  console.log(`platform:    ${process.platform}`);
  console.log(`node:        ${process.version}`);
  console.log(`config dir:  ${configDir()}`);
  console.log(
    `config file: ${configFilePath()}${existsSync(configFilePath()) ? '' : ' (missing — run `agent-notifier init`)'}`,
  );
  console.log('');

  let anyWired = false;
  for (const inst of allInstallers()) {
    const detected = await inst.detect();
    const wired = detected ? await inst.isWired() : false;
    if (wired) anyWired = true;
    const sym = wired ? kleur.green('✓') : detected ? kleur.yellow('!') : kleur.gray('✗');
    console.log(`${sym} ${inst.name.padEnd(12)} detected=${detected} wired=${wired}`);
  }
  console.log('');

  console.log('firing 3 test notifications…');
  for (const e of TEST_EVENTS) {
    if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotify(e);
    else await fireNotification(e);
  }

  const log = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
  const tail = log.readTail(5);
  if (tail.length > 0) {
    console.log('\nrecent log:');
    for (const t of tail)
      console.log(
        `  ${t.ts}  ${t.kind.padEnd(10)} ${t.tool.padEnd(12)} ${t.project} ${t.fired ? kleur.green('fired') : kleur.gray(t.suppressReason ?? 'suppressed')}`,
      );
  }

  process.exit(anyWired ? 0 : 1);
}
