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
  projectDisplayName,
  resolveProjectKey,
  type Config,
} from '@agent-notifier/core';
import { allInstallers } from './install.js';
import { sym, colorOk, colorWarn, colorFail, colorDim, isJson, isQuiet } from './lib/ui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = (
  JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
).version;

// Cross-platform safe tz guess (Task 3 follow-up): Intl can throw on some
// constrained Node builds; default to UTC rather than crashing on `status`.
function tzGuess(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export interface StatusOpts {
  verbose?: boolean;
  json?: boolean;
}

interface ToolState {
  name: string;
  detected: boolean;
  wired: boolean;
  enabled: boolean;
}

async function collectToolStates(c: Config): Promise<ToolState[]> {
  const out: ToolState[] = [];
  for (const inst of allInstallers()) {
    const detected = await inst.detect();
    const wired = detected ? await inst.isWired() : false;
    const enabled = c.tools[inst.name]?.enabled ?? true;
    out.push({ name: inst.name, detected, wired, enabled });
  }
  return out;
}

export async function runStatus(opts: StatusOpts = {}): Promise<void> {
  // CLI universal flags can also flow through opts (Commander populates) —
  // fall back to argv detection for the bare-command call site.
  const json = opts.json ?? isJson();
  const quiet = isQuiet();

  const tz = tzGuess();
  const store = new ConfigStore(configFilePath(), tz);
  const c = store.load();

  // Common state collection
  const idle = await getIdleSeconds();
  const projKey = resolveProjectKey(process.cwd());
  const proj = c.projects[projKey];
  const log = loggerFromConfig(c, logDir());
  const recentN = opts.verbose ? 20 : 5;
  const recent = log.readTail(recentN);

  const toolStates = await collectToolStates(c);

  if (json) {
    console.log(
      JSON.stringify(
        {
          version: VERSION,
          platform: process.platform,
          configDir: configDir(),
          globalEnabled: c.global.enabled,
          muted: c.mute,
          schedules: c.schedules,
          tools: toolStates,
          currentProject: {
            cwd: process.cwd(),
            key: projKey,
            entry: proj ?? null,
            defaultEnabled: c.projectDefault.enabled,
          },
          idleGate: {
            mode: c.idleGate.mode,
            thresholdSeconds: c.idleGate.thresholdSeconds,
            unsupportedTerminalPolicy: c.idleGate.unsupportedTerminalPolicy,
            currentIdleSeconds: idle === Infinity ? null : idle,
          },
          recent,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (quiet) return; // silent unless --verbose explicitly contradicts

  // Header
  console.log(
    kleur.bold(`agent-notifier ${VERSION}`) + colorDim(` · ${process.platform} · ${configDir()}`),
  );
  console.log('');

  // Notifications
  console.log(kleur.bold('Notifications'));
  console.log(`  Global    ${c.global.enabled ? colorOk('enabled') : colorFail('disabled')}`);
  console.log(`  Mute      ${c.mute ? colorWarn(`until ${c.mute.until}`) : colorDim('off')}`);
  if (c.schedules.length > 0) {
    if (opts.verbose) {
      console.log('  Schedules:');
      for (const s of c.schedules) {
        console.log(colorDim(`    [${s.id}] ${s.type} ${s.days.join(',')} ${s.from}-${s.to}`));
      }
    } else {
      console.log(`  Schedules ${colorDim(`${c.schedules.length} rule(s) — use --verbose`)}`);
    }
  }
  console.log('');

  // Tools
  console.log(kleur.bold('Tools'));
  for (const ts of toolStates) {
    const glyph = !ts.detected
      ? colorDim(sym.dot)
      : !ts.wired
        ? colorDim(sym.fail)
        : ts.enabled
          ? colorOk(sym.ok)
          : colorWarn(sym.warn);
    const note = !ts.detected
      ? colorDim('not detected')
      : !ts.wired
        ? colorDim('detected, not wired')
        : ts.enabled
          ? colorDim('wired & enabled')
          : colorWarn('wired but disabled');
    console.log(`  ${glyph} ${ts.name.padEnd(14)} ${note}`);
  }
  console.log('');

  // This project
  console.log(kleur.bold('This project'));
  console.log(`  Path      ${process.cwd()}`);
  console.log(`  Display   ${projectDisplayName(projKey)}`);
  if (proj) {
    console.log(
      `  Status    ${proj.enabled ? colorOk('enabled') : colorFail('disabled')} · kinds: ${proj.kinds?.join(',') ?? 'all'}`,
    );
  } else {
    console.log(
      `  Status    ${colorDim(`(not configured; default: ${c.projectDefault.enabled ? 'enabled' : 'disabled'})`)}`,
    );
  }
  console.log('');

  // Idle gate
  console.log(kleur.bold('Idle gate'));
  console.log(`  Activity  ${idle === Infinity ? colorDim('?') : `${idle}s ago`}`);
  if (opts.verbose) {
    console.log(`  Mode      ${c.idleGate.mode}`);
    console.log(`  Threshold ${c.idleGate.thresholdSeconds}s`);
    console.log(`  Policy    ${c.idleGate.unsupportedTerminalPolicy} (when active tab unknown)`);
  }
  console.log('');

  // Recent
  if (recent.length === 0) {
    console.log(colorDim(`(no recent activity — log at ${logDir()})`));
    return;
  }
  console.log(kleur.bold(`Recent · last ${recent.length}`));
  for (const t of recent) {
    const status = t.fired ? colorOk('fired') : colorDim(`suppressed (${t.suppressReason ?? '?'})`);
    console.log(
      `  ${colorDim(t.ts)}  ${t.kind.padEnd(10)} ${t.project.padEnd(18)} ${t.tool.padEnd(12)} ${status}`,
    );
  }
  if (opts.verbose) {
    console.log(colorDim(`\nFull log at ${logDir()}`));
  }
}
