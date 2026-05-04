import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LogsOpts } from './logs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program
  .name('agent-notifier')
  .description('Cross-platform notifier for AI coding CLIs')
  .version(pkg.version)
  // enablePositionalOptions prevents the root --json option from being
  // consumed when the user passes --json to a subcommand (e.g. `logs --json`).
  // Each subcommand's own --json option takes precedence when placed after
  // the subcommand name.
  .enablePositionalOptions()
  .option('-q, --quiet', 'suppress non-error output')
  .option('--json', 'machine-readable output')
  .option('--no-color', 'disable color')
  .option('--debug', 'verbose debugging output');

program
  .command('init')
  .description('interactive setup')
  .action(async () => {
    const { runInit } = await import('./init.js');
    await runInit();
  });
program
  .command('install')
  .description('headless: detect tools and wire up hooks')
  .action(async () => {
    const { runInstall } = await import('./install.js');
    await runInstall();
  });
program
  .command('uninstall')
  .description('restore .bak files, remove plugin files')
  .action(async () => {
    const { runUninstall } = await import('./uninstall.js');
    await runUninstall();
  });
program
  .command('doctor')
  .description('diagnose wiring + fire test notifications')
  .action(async () => {
    const { runDoctor } = await import('./doctor.js');
    await runDoctor();
  });
program
  .command('status')
  .description('print current config + recent logs')
  .option('-v, --verbose', 'show extra detail')
  .option('--json', 'machine-readable output')
  .option('-q, --quiet', 'suppress non-error output')
  .action(async (opts: { verbose?: boolean; json?: boolean; quiet?: boolean }) => {
    const { runStatus } = await import('./status.js');
    await runStatus(opts);
  });

program
  .command('enable')
  .description('enable notifications (defaults to current project)')
  .option('--global')
  .option('--project [path]')
  .option('--tool <tool>')
  .action(async (opts: { global?: boolean; project?: string | true; tool?: string }) => {
    const { runEnable } = await import('./enable.js');
    await runEnable(opts);
  });

program
  .command('disable')
  .description('disable notifications (defaults to current project)')
  .option('--global')
  .option('--project [path]')
  .option('--tool <tool>')
  .action(async (opts: { global?: boolean; project?: string | true; tool?: string }) => {
    const { runDisable } = await import('./disable.js');
    await runDisable(opts);
  });

program
  .command('mute <duration>')
  .description('mute notifications globally for a duration')
  .action(async (duration: string) => {
    const { runMute } = await import('./mute.js');
    await runMute(duration);
  });
program
  .command('unmute')
  .description('end an active mute')
  .action(async () => {
    const { runUnmute } = await import('./mute.js');
    await runUnmute();
  });

const sched = program.command('schedule').description('manage allow/deny windows');
sched.command('list').action(async () => {
  (await import('./schedule.js')).runScheduleList();
});
sched
  .command('add')
  .option('--allow')
  .option('--deny')
  .option('--days <days>')
  .option('--from <hhmm>')
  .option('--to <hhmm>')
  .option('--id <name>')
  .action(
    async (opts: {
      allow?: boolean;
      deny?: boolean;
      days?: string;
      from?: string;
      to?: string;
      id?: string;
    }) => {
      (await import('./schedule.js')).runScheduleAdd(opts);
    },
  );
sched.command('remove <id>').action(async (id: string) => {
  (await import('./schedule.js')).runScheduleRemove(id);
});
sched.command('clear').action(async () => {
  (await import('./schedule.js')).runScheduleClear();
});

program
  .command('logs')
  .option('--project [path]')
  .option('--tool <tool...>')
  .option('--kind <kind...>')
  .option('--suppressed')
  .option('--fired')
  .option('--since <duration>')
  .option('--tail <n>', '', '50')
  .option('--follow')
  .option('--json')
  .action(async (opts: LogsOpts) => {
    (await import('./logs.js')).runLogs(opts);
  });

program
  .command('hook')
  .description('internal: invoked by hooks themselves; reads JSON on stdin')
  .requiredOption('--tool <tool>')
  .action(async (opts: { tool: string }) => {
    const { runHook } = await import('./hook.js');
    await runHook(opts.tool);
  });

// Forward-declared types for reset.ts and project.ts (created in Tasks 18/19).
// The dynamic import() is deferred to runtime — these files do not exist yet.
// Type assertions below are justified: the shapes are contractual stubs that
// Tasks 18/19 must satisfy; a mismatch there will surface as a type error at
// that point, not here.
interface ResetModule {
  runReset: (opts: { yes?: boolean }) => Promise<void>;
}
interface ProjectModule {
  runProjectInteractive: () => Promise<void>;
  runProjectShow: (opts: { project?: string; json?: boolean }) => Promise<void>;
  runProjectSet: (opts: { enabled?: string; kinds?: string; project?: string }) => Promise<void>;
  runProjectClear: (opts: { project?: string; yes?: boolean }) => Promise<void>;
  runProjectList: (opts: { json?: boolean }) => Promise<void>;
}

program
  .command('reset')
  .description('uninstall hooks and delete config (preserves logs)')
  .option('--yes', 'skip confirmation')
  .action(async (opts: { yes?: boolean }) => {
    const { runReset } = (await import('./reset.js')) as ResetModule;
    await runReset(opts);
  });

const proj = program.command('project').description('manage per-project notification rules');

proj.action(async () => {
  const { runProjectInteractive } = (await import('./project.js')) as ProjectModule;
  await runProjectInteractive();
});

proj
  .command('show')
  .option('--project <path>', 'project path (default: cwd)')
  .option('--json')
  .action(async (opts: { project?: string; json?: boolean }) => {
    const { runProjectShow } = (await import('./project.js')) as ProjectModule;
    await runProjectShow(opts);
  });

proj
  .command('set')
  .option('--enabled <bool>', 'enable or disable (true/false)')
  .option('--kinds <list>', 'comma-separated event kinds (PERMISSION,IDLE,TURN_DONE)')
  .option('--project <path>', 'project path (default: cwd)')
  .action(async (opts: { enabled?: string; kinds?: string; project?: string }) => {
    const { runProjectSet } = (await import('./project.js')) as ProjectModule;
    await runProjectSet(opts);
  });

proj
  .command('clear')
  .option('--project <path>', 'project path (default: cwd)')
  .option('--yes', 'skip confirmation')
  .action(async (opts: { project?: string; yes?: boolean }) => {
    const { runProjectClear } = (await import('./project.js')) as ProjectModule;
    await runProjectClear(opts);
  });

proj
  .command('list')
  .option('--json')
  .action(async (opts: { json?: boolean }) => {
    const { runProjectList } = (await import('./project.js')) as ProjectModule;
    await runProjectList(opts);
  });

// Bare-command behavior: with no subcommand, route to init if config is
// missing (first-run) or status if it exists. Universal flags are honored
// by both downstream commands.
// If program.args is non-empty, an unknown subcommand was passed — treat
// it as an error so `agent-notifier no-such-thing` exits non-zero.
program.action(async () => {
  if (program.args.length > 0) {
    console.error(`error: unknown command '${program.args[0]}'`);
    program.help({ error: true });
    return;
  }
  const { existsSync } = await import('node:fs');
  const { configFilePath } = await import('@agent-notifier/core');
  if (!existsSync(configFilePath())) {
    const { runInit } = await import('./init.js');
    await runInit();
    return;
  }
  const { runStatus } = await import('./status.js');
  await runStatus();
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
