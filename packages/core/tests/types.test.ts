// packages/core/tests/types.test.ts
import { describe, it, expect } from 'vitest';
import { EventSchema, ConfigSchema, KindSchema, ToolNameSchema } from '../src/types.js';

describe('types', () => {
  it('KindSchema accepts the three event kinds', () => {
    expect(KindSchema.parse('PERMISSION')).toBe('PERMISSION');
    expect(KindSchema.parse('IDLE')).toBe('IDLE');
    expect(KindSchema.parse('TURN_DONE')).toBe('TURN_DONE');
    expect(() => KindSchema.parse('OTHER')).toThrow();
  });

  it('ToolNameSchema accepts the four tool names', () => {
    expect(ToolNameSchema.parse('claude-code')).toBe('claude-code');
    expect(ToolNameSchema.parse('codex')).toBe('codex');
    expect(ToolNameSchema.parse('gemini')).toBe('gemini');
    expect(ToolNameSchema.parse('opencode')).toBe('opencode');
    expect(() => ToolNameSchema.parse('aider')).toThrow();
  });

  it('EventSchema validates a complete event', () => {
    const e = EventSchema.parse({
      kind: 'PERMISSION',
      tool: 'claude-code',
      project: 'my-app',
      sessionId: 'abc123',
      cwd: '/Users/x/my-app',
      message: 'needs your permission',
    });
    expect(e.kind).toBe('PERMISSION');
  });

  it('ConfigSchema fills defaults for an empty document', () => {
    const c = ConfigSchema.parse({ version: 1, tz: 'UTC' });
    expect(c.global.enabled).toBe(true);
    expect(c.mute).toBeNull();
    expect(c.schedules).toEqual([]);
    expect(c.projectDefault.enabled).toBe(true);
  });

  it('ConfigSchema accepts a fully populated document', () => {
    const c = ConfigSchema.parse({
      version: 1,
      tz: 'Asia/Kolkata',
      global: { enabled: true },
      mute: { until: '2026-05-03T17:00:00.000Z' },
      schedules: [{ id: 'work', type: 'allow', days: ['mon', 'tue'], from: '09:00', to: '18:00' }],
      tools: { 'claude-code': { enabled: true } },
      projectDefault: { enabled: true },
      projects: { '/x': { enabled: false } },
    });
    expect(c.schedules[0]?.from).toBe('09:00');
  });
});
