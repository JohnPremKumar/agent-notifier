// packages/core/tests/suppress.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateSuppression } from '../src/suppress.js';
import { clearGateCache } from '../src/idle-gate.js';
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
  it('fires when nothing suppresses', async () => {
    const c = cfg((c) => {
      c.idleGate.mode = 'always-fire';
    });
    const r = await evaluateSuppression(c, NOW, event(), PROJ, 12345);
    expect(r.fire).toBe(true);
  });

  it('suppresses when global disabled', async () => {
    const c = cfg((c) => {
      c.global.enabled = false;
    });
    expect(await evaluateSuppression(c, NOW, event(), PROJ, 12345)).toEqual({
      fire: false,
      reason: 'global-disabled',
    });
  });

  it('suppresses while mute is active', async () => {
    const c = cfg((c) => {
      c.mute = { until: '2026-05-04T11:00:00.000Z' };
    });
    const r = await evaluateSuppression(c, NOW, event(), PROJ, 12345);
    expect(r.fire).toBe(false);
    expect(r.reason).toMatch(/^muted-until/);
  });

  it('lets through when mute has expired', async () => {
    const c = cfg((c) => {
      c.mute = { until: '2026-05-04T09:00:00.000Z' };
      c.idleGate.mode = 'always-fire';
    });
    expect((await evaluateSuppression(c, NOW, event(), PROJ, 12345)).fire).toBe(true);
  });

  it('suppresses when schedule denies', async () => {
    const c = cfg((c) => {
      c.schedules = [{ id: 'q', type: 'deny', days: ['mon'], from: '09:00', to: '18:00' }];
    });
    expect(await evaluateSuppression(c, NOW, event(), PROJ, 12345)).toEqual({
      fire: false,
      reason: 'schedule-deny',
    });
  });

  it('suppresses when tool disabled', async () => {
    const c = cfg((c) => {
      c.tools['claude-code'] = { enabled: false };
    });
    expect(await evaluateSuppression(c, NOW, event(), PROJ, 12345)).toEqual({
      fire: false,
      reason: 'tool-disabled',
    });
  });

  it('suppresses when project entry disabled', async () => {
    const c = cfg((c) => {
      c.projects[PROJ] = { enabled: false };
    });
    expect(await evaluateSuppression(c, NOW, event(), PROJ, 12345)).toEqual({
      fire: false,
      reason: 'project-disabled',
    });
  });

  it('suppresses when project filters out this kind', async () => {
    const c = cfg((c) => {
      c.projects[PROJ] = { enabled: true, kinds: ['PERMISSION'] };
    });
    expect(await evaluateSuppression(c, NOW, event({ kind: 'IDLE' }), PROJ, 12345)).toEqual({
      fire: false,
      reason: 'project-filter',
    });
  });

  it('uses projectDefault when project has no entry', async () => {
    const c = cfg((c) => {
      c.projectDefault.enabled = false;
    });
    expect(await evaluateSuppression(c, NOW, event(), PROJ, 12345)).toEqual({
      fire: false,
      reason: 'project-default-disabled',
    });
  });
});

describe('evaluateSuppression with new gate', () => {
  beforeEach(() => clearGateCache());

  it('still bypasses gate for PERMISSION (no exec calls beyond gate internals)', async () => {
    const c = cfg();
    const exec = vi.fn();
    const r = await evaluateSuppression(c, NOW, event({ kind: 'PERMISSION' }), PROJ, 12345, {
      gateOpts: { exec, platform: 'darwin' },
    });
    expect(r.fire).toBe(true);
    expect(r.gateDecision).toBe('permission-bypass');
    expect(exec).not.toHaveBeenCalled(); // PERMISSION short-circuits before any probe
  });

  it('records gateMode and gateDecision in result', async () => {
    const c = cfg((c) => {
      c.idleGate.mode = 'always-fire';
    });
    const r = await evaluateSuppression(c, NOW, event(), PROJ, 12345);
    expect(r.fire).toBe(true);
    expect(r.gateMode).toBe('always-fire');
    expect(r.gateDecision).toBe('mode-always-fire');
  });

  it('returns gate:* reason and full gate metadata when strict-os-idle suppresses', async () => {
    const c = cfg((c) => {
      c.idleGate.mode = 'strict-os-idle';
      c.idleGate.thresholdSeconds = 60;
    });
    // ioreg output reports 5 seconds idle (5 * 1e9 ns) — well below the 60s threshold.
    const exec = vi.fn().mockResolvedValue({
      stdout: '"HIDIdleTime" = 5000000000',
      stderr: '',
    });
    const r = await evaluateSuppression(c, NOW, event(), PROJ, 12345, {
      gateOpts: { exec, platform: 'darwin' },
    });
    expect(r.fire).toBe(false);
    expect(r.reason).toBe('gate:os-active');
    expect(r.gateMode).toBe('strict-os-idle');
    expect(r.gateDecision).toBe('os-active');
  });
});
