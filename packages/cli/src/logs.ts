import kleur from 'kleur';
import {
  Logger,
  logDir,
  resolveProjectKey,
  KindSchema,
  ToolNameSchema,
  type LogEntry,
} from '@agent-notifier/core';

export interface LogsOpts {
  project?: string | true;
  tool?: string[];
  kind?: string[];
  suppressed?: boolean;
  fired?: boolean;
  since?: string;
  tail?: string;
  follow?: boolean;
  json?: boolean;
}

function parseSince(spec: string, now: Date = new Date()): Date {
  const trimmed = spec.trim().toLowerCase();
  if (trimmed === 'today') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  if (trimmed === 'yesterday') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
  const m = trimmed.match(/^(\d+)\s*(s|m|h|d)$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2]!;
    const ms = n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0);
    return new Date(now.getTime() - ms);
  }
  const d = new Date(spec);
  if (Number.isNaN(d.getTime())) throw new Error(`Cannot parse --since: ${spec}`);
  return d;
}

function matches(entry: LogEntry, opts: LogsOpts, projectKey?: string): boolean {
  if (opts.tool && !opts.tool.map((t) => ToolNameSchema.parse(t)).includes(entry.tool as never))
    return false;
  if (opts.kind && !opts.kind.map((k) => KindSchema.parse(k)).includes(entry.kind as never))
    return false;
  if (opts.suppressed && entry.fired) return false;
  if (opts.fired && !entry.fired) return false;
  if (projectKey && entry.project !== projectKey.split('/').pop()) return false;
  if (opts.since) {
    const since = parseSince(opts.since);
    if (new Date(entry.ts).getTime() < since.getTime()) return false;
  }
  return true;
}

export function runLogs(opts: LogsOpts): void {
  const log = new Logger({ dir: logDir(), maxBytes: 1_000_000, generations: 3 });
  const projectKey =
    opts.project === true
      ? resolveProjectKey(process.cwd())
      : typeof opts.project === 'string'
        ? resolveProjectKey(opts.project)
        : undefined;
  const all = log.readAll().filter((e) => matches(e, opts, projectKey));
  const tail = Number(opts.tail ?? '50');
  const slice = all.slice(Math.max(0, all.length - tail));

  for (const e of slice) {
    if (opts.json) {
      console.log(JSON.stringify(e));
      continue;
    }
    const tag = e.fired
      ? kleur.green('fired')
      : kleur.gray(`suppressed (${e.suppressReason ?? '?'})`);
    console.log(
      `${e.ts}  ${e.kind.padEnd(10)} ${e.project.padEnd(16)} ${e.tool.padEnd(12)} ${e.sessionId.padEnd(12)} ${tag}`,
    );
  }
}
