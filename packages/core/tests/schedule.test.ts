import { describe, it, expect } from 'vitest';
import { evaluateSchedule } from '../src/schedule.js';
import type { ScheduleRule } from '../src/types.js';

const at = (iso: string) => new Date(iso);

describe('evaluateSchedule', () => {
  it('returns "neutral" when no rules are configured', () => {
    expect(evaluateSchedule([], at('2026-05-04T10:00:00Z'), 'UTC')).toBe('neutral');
  });

  it('returns "allow" when an allow rule matches now', () => {
    const r: ScheduleRule[] = [
      { id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' },
    ];
    expect(evaluateSchedule(r, at('2026-05-04T10:00:00Z'), 'UTC')).toBe('allow'); // 2026-05-04 = Mon
  });

  it('returns "deny" when an allow rule exists but none matches now', () => {
    const r: ScheduleRule[] = [
      { id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' },
    ];
    expect(evaluateSchedule(r, at('2026-05-04T20:00:00Z'), 'UTC')).toBe('deny');
  });

  it('returns "deny" when a deny rule matches now even if an allow rule also matches', () => {
    const r: ScheduleRule[] = [
      { id: 'a', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' },
      { id: 'lunch', type: 'deny', days: ['mon'], from: '12:00', to: '13:00' },
    ];
    expect(evaluateSchedule(r, at('2026-05-04T12:30:00Z'), 'UTC')).toBe('deny');
  });

  it('treats only-deny config as "neutral" outside the deny window', () => {
    const r: ScheduleRule[] = [
      { id: 'q', type: 'deny', days: ['mon'], from: '22:00', to: '23:00' },
    ];
    expect(evaluateSchedule(r, at('2026-05-04T10:00:00Z'), 'UTC')).toBe('neutral');
  });

  it('handles windows that cross midnight (22:00 → 06:00)', () => {
    const r: ScheduleRule[] = [
      { id: 'q', type: 'deny', days: ['mon'], from: '22:00', to: '06:00' },
    ];
    expect(evaluateSchedule(r, at('2026-05-04T23:30:00Z'), 'UTC')).toBe('deny');
    expect(evaluateSchedule(r, at('2026-05-05T05:00:00Z'), 'UTC')).toBe('deny'); // tue 05:00 = mon's overflow
    expect(evaluateSchedule(r, at('2026-05-05T07:00:00Z'), 'UTC')).toBe('neutral');
  });

  it('respects timezone (IST = UTC+05:30)', () => {
    const r: ScheduleRule[] = [
      { id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' },
    ];
    // 04:00 UTC Monday = 09:30 IST Monday → inside window
    expect(evaluateSchedule(r, at('2026-05-04T04:00:00Z'), 'Asia/Kolkata')).toBe('allow');
  });

  it('day boundary respected per timezone', () => {
    const r: ScheduleRule[] = [
      { id: 'work', type: 'allow', days: ['mon'], from: '09:00', to: '18:00' },
    ];
    // 23:00 UTC Sunday = 04:30 IST Monday → before window starts → has allow but not active → deny
    expect(evaluateSchedule(r, at('2026-05-03T23:00:00Z'), 'Asia/Kolkata')).toBe('deny');
  });

  it('weekend day not in days[] yields no allow → deny when allow rules exist', () => {
    const r: ScheduleRule[] = [
      {
        id: 'work',
        type: 'allow',
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        from: '09:00',
        to: '18:00',
      },
    ];
    expect(evaluateSchedule(r, at('2026-05-09T12:00:00Z'), 'UTC')).toBe('deny'); // sat
  });
});
