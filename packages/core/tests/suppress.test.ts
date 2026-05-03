// packages/core/tests/suppress.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateSuppression } from '../src/suppress.js';
import { defaultConfig } from '../src/config.js';
import type { Config, Event } from '../src/types.js';

const event = (overrides: Partial<Event> = {}): Event => ({
  kind: 'TURN_DONE',
  tool: 'claude-code',
  project: 'demo',
  sessionId: 's1',
  cwd: '/Users/x/repo',
  ...overrides,
});

const cfg = (mut: (c: Config) => void = () => {}): Config => {
  const c = defaultConfig('UTC');
  mut(c);
  return c;
};

const NOW = new Date('2026-05-04T10:00:00Z');
const PROJ = '/Users/x/repo';

describe('evaluateSuppression', () => {
  it('fires when nothing suppresses', () => {
    const r = evaluateSuppression(cfg(), NOW, event(), 60, PROJ);
    expect(r.fire).toBe(true);
  });

  it('suppresses when global disabled', () => {
    const c = cfg((c) => {
      c.global.enabled = false;
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({
      fire: false,
      reason: 'global-disabled',
    });
  });

  it('suppresses while mute is active', () => {
    const c = cfg((c) => {
      c.mute = { until: '2026-05-04T11:00:00.000Z' };
    });
    const r = evaluateSuppression(c, NOW, event(), 60, PROJ);
    expect(r.fire).toBe(false);
    expect(r.reason).toMatch(/^muted-until/);
  });

  it('lets through when mute has expired', () => {
    const c = cfg((c) => {
      c.mute = { until: '2026-05-04T09:00:00.000Z' };
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ).fire).toBe(true);
  });

  it('suppresses when schedule denies', () => {
    const c = cfg((c) => {
      c.schedules = [{ id: 'q', type: 'deny', days: ['mon'], from: '09:00', to: '18:00' }];
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({
      fire: false,
      reason: 'schedule-deny',
    });
  });

  it('suppresses when tool disabled', () => {
    const c = cfg((c) => {
      c.tools['claude-code'] = { enabled: false };
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({
      fire: false,
      reason: 'tool-disabled',
    });
  });

  it('suppresses when project entry disabled', () => {
    const c = cfg((c) => {
      c.projects[PROJ] = { enabled: false };
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({
      fire: false,
      reason: 'project-disabled',
    });
  });

  it('suppresses when project filters out this kind', () => {
    const c = cfg((c) => {
      c.projects[PROJ] = { enabled: true, kinds: ['PERMISSION'] };
    });
    expect(evaluateSuppression(c, NOW, event({ kind: 'IDLE' }), 60, PROJ)).toEqual({
      fire: false,
      reason: 'project-filter',
    });
  });

  it('uses projectDefault when project has no entry', () => {
    const c = cfg((c) => {
      c.projectDefault.enabled = false;
    });
    expect(evaluateSuppression(c, NOW, event(), 60, PROJ)).toEqual({
      fire: false,
      reason: 'project-default-disabled',
    });
  });

  it('suppresses TURN_DONE when user active (idle < threshold)', () => {
    expect(
      evaluateSuppression(cfg(), NOW, event({ kind: 'TURN_DONE' }), 5, PROJ, { idleThreshold: 30 }),
    ).toEqual({ fire: false, reason: 'user-active' });
  });

  it('PERMISSION bypasses idle gate', () => {
    expect(
      evaluateSuppression(cfg(), NOW, event({ kind: 'PERMISSION' }), 5, PROJ, { idleThreshold: 30 })
        .fire,
    ).toBe(true);
  });

  it('idle threshold honored at boundary', () => {
    expect(
      evaluateSuppression(cfg(), NOW, event({ kind: 'IDLE' }), 30, PROJ, { idleThreshold: 30 })
        .fire,
    ).toBe(true);
    expect(
      evaluateSuppression(cfg(), NOW, event({ kind: 'IDLE' }), 29, PROJ, { idleThreshold: 30 })
        .fire,
    ).toBe(false);
  });
});
