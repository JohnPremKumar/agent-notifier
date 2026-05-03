import type { Config, Event } from './types.js';
import { evaluateSchedule } from './schedule.js';
import { decideGate, type GateDecision, type GetIdleOptions } from './idle-gate.js';

export interface SuppressDecision {
  fire: boolean;
  reason?: string;
  gateMode?: Config['idleGate']['mode'];
  gateDecision?: GateDecision;
}

export interface SuppressOptions {
  gateOpts?: GetIdleOptions;
}

export async function evaluateSuppression(
  config: Config,
  now: Date,
  event: Event,
  projectKey: string,
  hookPpid: number,
  opts: SuppressOptions = {},
): Promise<SuppressDecision> {
  if (!config.global.enabled) return { fire: false, reason: 'global-disabled' };

  if (config.mute && new Date(config.mute.until).getTime() > now.getTime()) {
    return { fire: false, reason: `muted-until-${config.mute.until}` };
  }

  const sched = evaluateSchedule(config.schedules, now, config.tz);
  if (sched === 'deny') return { fire: false, reason: 'schedule-deny' };

  const toolEntry = config.tools[event.tool];
  if (toolEntry && !toolEntry.enabled) return { fire: false, reason: 'tool-disabled' };

  const projEntry = config.projects[projectKey];
  if (projEntry) {
    if (!projEntry.enabled) return { fire: false, reason: 'project-disabled' };
    if (projEntry.kinds && !projEntry.kinds.includes(event.kind)) {
      return { fire: false, reason: 'project-filter' };
    }
  } else if (!config.projectDefault.enabled) {
    return { fire: false, reason: 'project-default-disabled' };
  }

  const gate = await decideGate(config, event.kind, hookPpid, opts.gateOpts);
  return {
    fire: gate.fire,
    ...(gate.fire ? {} : { reason: `gate:${gate.reason}` }),
    gateMode: config.idleGate.mode,
    gateDecision: gate.reason,
  };
}
