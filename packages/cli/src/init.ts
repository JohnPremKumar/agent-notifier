import { checkbox, input, confirm, select } from '@inquirer/prompts';
import kleur from 'kleur';
import { existsSync } from 'node:fs';
import {
  ConfigStore,
  configFilePath,
  configDir,
  defaultConfig,
  fireNotification,
  stubNotifyAppend,
  type Event,
  type ToolName,
  type Config,
} from '@agent-notifier/core';
import { allInstallers, type ToolInstaller } from './install.js';
import { acquireInitLock, releaseInitLock } from './lib/lock.js';
import { sym, colorOk, colorDim, spinner } from './lib/ui.js';

export interface InitOpts {
  advanced?: boolean;
  tools?: string;
  noTest?: boolean;
  schedule?: string; // 'HH:MM-HH:MM'
  scheduleDays?: string; // 'mon,tue,wed'
  idleGate?: string;
  idleThreshold?: number;
  unsupportedTabPolicy?: 'fire' | 'gate';
  sound?: string;
  icon?: string;
  kinds?: string;
  reset?: boolean;
  yes?: boolean;
  // Test injection point — defaults to allInstallers() when absent.
  _installers?: ToolInstaller[];
}

function tzGuess(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

async function detectedFrom(installers: ToolInstaller[]): Promise<ToolInstaller[]> {
  const out: ToolInstaller[] = [];
  for (const i of installers) if (await i.detect()) out.push(i);
  return out;
}

export async function runInit(opts: InitOpts = {}): Promise<void> {
  // --reset short-circuit: uninstall + delete config, then fall through as first-run.
  // Dynamic import() so reset.ts is not required at build time (Task 18 merges separately).
  if (opts.reset) {
    // Dynamic import keeps reset.ts out of the build graph until it merges (Task 18).
    // The type assertion is justified: this is the contractual shape Task 18 must export.
    const { runReset } = (await import('./reset.js')) as {
      runReset: (o: { yes?: boolean }) => Promise<void>;
    };
    await runReset({ yes: opts.yes });
    return runInit({ ...opts, reset: false });
  }

  const lock = acquireInitLock();
  if (!lock.ok) {
    console.error(`${kleur.yellow(sym.alert)} Another setup is in progress (PID ${lock.pid}).`);
    console.error('  Next: wait for it, or remove ~/.agent-notifier/.init.lock if stale.');
    process.exit(1);
  }
  try {
    await runInitInner(opts);
  } finally {
    releaseInitLock();
  }
}

async function runInitInner(opts: InitOpts): Promise<void> {
  const file = configFilePath();
  const isReinit = existsSync(file);
  const tz = tzGuess();
  const store = new ConfigStore(file, tz);
  const current = isReinit ? store.load() : defaultConfig(tz);

  console.log(
    kleur.bold(isReinit ? 'agent-notifier — reconfigure' : 'agent-notifier — set up') + '\n',
  );

  const installers = opts._installers ?? allInstallers();
  const det = await detectedFrom(installers);

  if (det.length === 0) {
    console.log(`  ${colorDim('No supported AI CLIs detected.')}\n`);
  } else {
    console.log('  Detected on this machine');
    for (const i of det) {
      const wired = await i.isWired();
      const mark = wired ? colorOk(sym.ok) : colorDim(sym.dot);
      console.log(`    ${mark} ${i.name.padEnd(14)} ${colorDim(wired ? 'wired' : 'detected')}`);
    }
    console.log('');
  }

  // Determine tool selection: --tools flag, prompt, or default-all
  const flagTools = opts.tools?.split(',').map((s) => s.trim()) as ToolName[] | undefined;
  const detectedNames = det.map((d) => d.name);
  let chosen: ToolName[];
  if (flagTools) {
    chosen = flagTools.filter((t) => detectedNames.includes(t));
  } else {
    const wiredNow = new Set<ToolName>();
    for (const i of det) if (await i.isWired()) wiredNow.add(i.name);
    chosen = await checkbox({
      message: isReinit ? 'Tools to keep wired (toggle to add/remove):' : 'Wire these up?',
      choices: det.map((d) => ({
        name: d.name,
        value: d.name,
        checked: wiredNow.size ? wiredNow.has(d.name) : true,
      })),
    });
  }

  // Apply tool changes with spinners
  for (const inst of det) {
    const wired = await inst.isWired();
    const want = chosen.includes(inst.name);
    if (want && !wired) {
      const sp = spinner(`Wiring ${inst.name}…`);
      sp.start();
      try {
        await inst.install();
        sp.succeed(`Wired ${inst.name}`);
      } catch (e) {
        sp.fail(`Couldn't wire ${inst.name}`);
        throw e;
      }
    } else if (!want && wired) {
      const sp = spinner(`Removing ${inst.name}…`);
      sp.start();
      try {
        await inst.uninstall();
        sp.succeed(`Removed ${inst.name}`);
      } catch (e) {
        sp.fail(`Couldn't remove ${inst.name}`);
        throw e;
      }
    }
  }

  // Build new config: preserve current, override tools
  const next: Config = { ...current, version: 2, tz };
  for (const t of ['claude-code', 'codex', 'gemini', 'opencode'] as const) {
    next.tools[t] = { enabled: chosen.includes(t) };
  }

  // Advanced flow (only on --advanced)
  if (opts.advanced) {
    next.idleGate.mode = await select({
      message: 'Idle-gate mode:',
      choices: [
        {
          name: 'fire-elsewhere (recommended): notify when you switch to a different app',
          value: 'fire-elsewhere' as const,
        },
        {
          name: 'always-fire: notify on every event regardless of focus',
          value: 'always-fire' as const,
        },
        {
          name: 'strict-terminal: gate the entire terminal app, not just other tabs',
          value: 'strict-terminal' as const,
        },
        {
          name: 'strict-os-idle: legacy HIDIdleTime only (no terminal awareness)',
          value: 'strict-os-idle' as const,
        },
      ],
      default: current.idleGate.mode,
    });

    next.idleGate.thresholdSeconds = Number(
      await input({
        message: 'Idle threshold (seconds before treating "active app elsewhere" as a fire):',
        default: String(current.idleGate.thresholdSeconds),
      }),
    );

    next.idleGate.unsupportedTerminalPolicy = await select({
      message: "When the terminal can't tell us which tab is focused:",
      choices: [
        {
          name: 'fire (notify anyway — recommended for laymen)',
          value: 'fire' as const,
        },
        {
          name: 'gate (suppress, like the whole app is in focus)',
          value: 'gate' as const,
        },
      ],
      default: current.idleGate.unsupportedTerminalPolicy,
    });

    const soundPick = await input({
      message: 'Sound (built-in name like "Ping" or absolute path to .aiff/.caf):',
      default: current.sound.darwin,
    });
    next.sound.darwin = soundPick;

    const iconPick = await input({
      message: 'Custom icon path (empty = bundled default):',
      default: current.icon.darwin ?? '',
    });
    next.icon.darwin = iconPick.trim() === '' ? null : iconPick;
  }

  // Schedule from non-interactive flags only (no prompt for this in v1)
  if (opts.schedule && opts.scheduleDays) {
    const [from, to] = opts.schedule.split('-');
    if (!from || !to) {
      throw new Error(`Invalid --schedule '${opts.schedule}' — expected 'HH:MM-HH:MM'`);
    }
    next.schedules = [
      ...current.schedules,
      {
        id: 'work-hours',
        type: 'allow',
        days: opts.scheduleDays.split(',').map((d) => d.trim()) as Config['schedules'][0]['days'],
        from,
        to,
      },
    ];
  }

  store.save(next);
  console.log(`${colorOk(sym.ok)} wrote config to ${file}\n`);

  // Test fire — default Yes on first-run, No on re-init
  const testDefault = !isReinit;
  const wantTest =
    opts.noTest === true
      ? false
      : await confirm({ message: 'Send a test notification now?', default: testDefault });
  if (wantTest) {
    if (process.platform === 'darwin') {
      console.log(
        colorDim(
          "  Heads up: macOS may ask permission for agent-notifier to detect which app you're focused on — say allow.",
        ),
      );
    }
    const ev: Event = {
      kind: 'TURN_DONE',
      tool: 'claude-code',
      project: '<init-test>',
      sessionId: 'init',
      cwd: process.cwd(),
      message: 'init test',
    };
    if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') {
      stubNotifyAppend(configDir(), ev);
    } else {
      await fireNotification(ev, { config: next });
    }
  }

  console.log(kleur.bold('\nDone.') + colorDim(' Run `agent-notifier status` anytime.'));
  if (!opts.advanced) {
    console.log(
      colorDim('Pro tip: `agent-notifier init --advanced` for schedules, sound, gate options.'),
    );
  }
  console.log(
    colorDim('         `agent-notifier project` (in any project dir) for per-project rules.'),
  );
}
