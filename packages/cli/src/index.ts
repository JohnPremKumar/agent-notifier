import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program
  .name('agent-notifier')
  .description('Cross-platform notifier for AI coding CLIs')
  .version(pkg.version);

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
  .action(async () => {
    const { runStatus } = await import('./status.js');
    await runStatus();
  });

program
  .command('enable')
  .description('enable notifications (defaults to current project)')
  .option('--global')
  .option('--project [path]')
  .option('--tool <tool>')
  .action(async (opts) => {
    const { runEnable } = await import('./enable.js');
    await runEnable(opts);
  });

program
  .command('disable')
  .description('disable notifications (defaults to current project)')
  .option('--global')
  .option('--project [path]')
  .option('--tool <tool>')
  .action(async (opts) => {
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
  .action(async (opts) => {
    (await import('./schedule.js')).runScheduleAdd(opts);
  });
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
  .action(async (opts) => {
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

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
