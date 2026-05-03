import type { Config, Event } from './types.js';
import { evaluateSchedule } from './schedule.js';

export interface SuppressDecision {
  fire: boolean;
  reason?: string;
}

export interface SuppressOptions {
  idleThreshold?: number; // seconds
}

const DEFAULT_IDLE_THRESHOLD = 30;

export function evaluateSuppression(
  config: Config,
  now: Date,
  event: Event,
  idleSeconds: number,
  projectKey: string,
  opts: SuppressOptions = {},
): SuppressDecision {
  const idleThreshold = opts.idleThreshold ?? DEFAULT_IDLE_THRESHOLD;

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

  if (event.kind !== 'PERMISSION' && idleSeconds < idleThreshold) {
    return { fire: false, reason: 'user-active' };
  }

  return { fire: true };
}
