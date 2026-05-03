import { checkbox, input, confirm, select } from '@inquirer/prompts';
import kleur from 'kleur';
import {
  ConfigStore,
  configDir,
  configFilePath,
  defaultConfig,
  fireNotification,
  stubNotifyAppend,
  type Event,
  type ToolName,
} from '@agent-notifier/core';
import { allInstallers, type ToolInstaller } from './install.js';

function tzGuess(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

async function detectedTools(): Promise<ToolInstaller[]> {
  const out: ToolInstaller[] = [];
  for (const i of allInstallers()) if (await i.detect()) out.push(i);
  return out;
}

export async function runInit(): Promise<void> {
  console.log(kleur.bold('Welcome to agent-notifier setup.'));

  const detected = await detectedTools();
  const chosen: ToolName[] =
    detected.length === 0
      ? []
      : await checkbox({
          message: 'Which tools do you want to wire up?',
          choices: detected.map((d) => ({ name: d.name, value: d.name, checked: true })),
        });

  const tz = await input({ message: 'Your timezone:', default: tzGuess() });

  const wantSchedule = await confirm({ message: 'Notify only during work hours?', default: false });
  let schedule: { from: string; to: string } | null = null;
  if (wantSchedule) {
    const from = await input({ message: 'Start time (HH:MM, 24h):', default: '09:00' });
    const to = await input({ message: 'End time (HH:MM, 24h):', default: '18:00' });
    schedule = { from, to };
  }

  const projDefault = await select({
    message: 'For new (unconfigured) projects, default to:',
    choices: [
      { name: 'enabled (notify by default)', value: 'enabled' },
      { name: 'disabled (silent until you opt in)', value: 'disabled' },
    ],
    default: 'enabled',
  });

  for (const i of allInstallers()) {
    if (chosen.includes(i.name) && (await i.detect()) && !(await i.isWired())) {
      await i.install();
      console.log(`${kleur.green('✓')} wired ${i.name}`);
    }
  }

  const cfg = defaultConfig(tz);
  cfg.projectDefault.enabled = projDefault === 'enabled';
  if (schedule) {
    cfg.schedules.push({
      id: 'work-hours',
      type: 'allow',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      from: schedule.from,
      to: schedule.to,
    });
  }
  new ConfigStore(configFilePath(), tz).save(cfg);
  console.log(`${kleur.green('✓')} wrote config to ${configFilePath()}`);

  const testThem = await confirm({ message: 'Fire 3 test notifications now?', default: true });
  if (testThem) {
    for (const kind of ['PERMISSION', 'IDLE', 'TURN_DONE'] as const) {
      const ev: Event = {
        kind,
        tool: 'claude-code',
        project: '<init-test>',
        sessionId: 'init',
        cwd: process.cwd(),
        message: `init test ${kind}`,
      };
      if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') stubNotifyAppend(configDir(), ev);
      else await fireNotification(ev);
    }
  }

  console.log(kleur.bold('\nDone. Run `agent-notifier status` anytime to see current state.'));
}
