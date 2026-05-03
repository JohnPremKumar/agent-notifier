import kleur from 'kleur';
import { ConfigStore, configFilePath, ScheduleRuleSchema, type ScheduleRule } from '@agent-notifier/core';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];

function parseDays(spec: string): Day[] {
  if (spec.includes('-')) {
    const [a, b] = spec.split('-') as [string, string];
    const i = DAYS.indexOf(a as Day);
    const j = DAYS.indexOf(b as Day);
    if (i < 0 || j < 0 || i > j) throw new Error(`Bad day range: ${spec}`);
    return DAYS.slice(i, j + 1);
  }
  return spec.split(',').map((d) => {
    if (!DAYS.includes(d as Day)) throw new Error(`Unknown day: ${d}`);
    return d as Day;
  });
}

function tz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function store(): ConfigStore {
  return new ConfigStore(configFilePath(), tz());
}

export interface AddOpts {
  allow?: boolean;
  deny?: boolean;
  days?: string;
  from?: string;
  to?: string;
  id?: string;
}

export function runScheduleAdd(opts: AddOpts): void {
  if (opts.allow && opts.deny) {
    throw new Error('--allow and --deny are mutually exclusive');
  }
  if (!opts.allow && !opts.deny) {
    throw new Error('Pass either --allow or --deny');
  }
  if (!opts.days || !opts.from || !opts.to) {
    throw new Error('--days, --from, --to are required');
  }
  const rule: ScheduleRule = ScheduleRuleSchema.parse({
    id: opts.id ?? `sched-${Date.now().toString(36)}`,
    type: opts.allow ? 'allow' : 'deny',
    days: parseDays(opts.days),
    from: opts.from,
    to: opts.to,
  });
  store().update((c) => {
    c.schedules.push(rule);
  });
  console.log(`${kleur.green('✓')} added schedule ${rule.id} (${rule.type})`);
}

export function runScheduleList(): void {
  const c = store().load();
  if (c.schedules.length === 0) {
    console.log(kleur.gray('(no schedules configured)'));
    return;
  }
  for (const s of c.schedules) {
    console.log(
      `  ${s.id.padEnd(20)} ${s.type.padEnd(5)} ${s.days.join(',').padEnd(28)} ${s.from}-${s.to}`,
    );
  }
}

export function runScheduleRemove(id: string): void {
  store().update((c) => {
    c.schedules = c.schedules.filter((s) => s.id !== id);
  });
  console.log(`${kleur.yellow('-')} removed ${id}`);
}

export function runScheduleClear(): void {
  store().update((c) => {
    c.schedules = [];
  });
  console.log(`${kleur.yellow('-')} cleared all schedules`);
}
