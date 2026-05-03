import type { ScheduleRule } from './types.js';

export type ScheduleState = 'allow' | 'deny' | 'neutral';

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface LocalTime {
  day: (typeof DAY_NAMES)[number];
  minutes: number; // minutes since 00:00 in local tz
}

function localTime(now: Date, tz: string): LocalTime {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? 'mon';
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minPart = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = Number(hourPart === '24' ? '00' : hourPart);
  const minute = Number(minPart);
  const dayMap: Record<string, (typeof DAY_NAMES)[number]> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
  };
  return { day: dayMap[wd] ?? 'mon', minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function previousDay(d: (typeof DAY_NAMES)[number]): (typeof DAY_NAMES)[number] {
  const i = DAY_INDEX[d];
  return DAY_NAMES[(i + 6) % 7]!;
}

function ruleMatches(rule: ScheduleRule, lt: LocalTime): boolean {
  const from = toMinutes(rule.from);
  const to = toMinutes(rule.to);
  if (from < to) {
    return rule.days.includes(lt.day) && lt.minutes >= from && lt.minutes < to;
  }
  // Crosses midnight: matches if today is in days[] and minutes >= from,
  // OR yesterday is in days[] and minutes < to.
  const todayMatch = rule.days.includes(lt.day) && lt.minutes >= from;
  const overflowMatch = rule.days.includes(previousDay(lt.day)) && lt.minutes < to;
  return todayMatch || overflowMatch;
}

export function evaluateSchedule(rules: ScheduleRule[], now: Date, tz: string): ScheduleState {
  if (rules.length === 0) return 'neutral';
  const lt = localTime(now, tz);
  const denyActive = rules.some((r) => r.type === 'deny' && ruleMatches(r, lt));
  if (denyActive) return 'deny';
  const allows = rules.filter((r) => r.type === 'allow');
  if (allows.length === 0) return 'neutral';
  const allowActive = allows.some((r) => ruleMatches(r, lt));
  return allowActive ? 'allow' : 'deny';
}
