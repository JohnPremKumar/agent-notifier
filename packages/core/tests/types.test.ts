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
});

describe('ConfigSchema v2', () => {
  it('parses an empty object with all defaults', () => {
    const c = ConfigSchema.parse({ version: 2, tz: 'UTC' });
    expect(c.version).toBe(2);
    expect(c.idleGate.mode).toBe('fire-elsewhere');
    expect(c.idleGate.thresholdSeconds).toBe(60);
    expect(c.idleGate.unsupportedTerminalPolicy).toBe('fire');
    expect(c.sound.darwin).toBe('Ping');
    expect(c.sound.win32).toBe('ms-winsoundevent:Notification.Default');
    expect(c.icon.darwin).toBeNull();
    expect(c.icon.win32).toBeNull();
    expect(c.logging.maxBytes).toBe(1_000_000);
    expect(c.logging.generations).toBe(3);
  });

  it('rejects unknown fields under strict zod', () => {
    expect(() => ConfigSchema.parse({ version: 2, tz: 'UTC', bogusField: true })).toThrow();
  });

  it('rejects v1 directly (migration handles upgrade)', () => {
    expect(() => ConfigSchema.parse({ version: 1, tz: 'UTC' })).toThrow();
  });

  it('round-trips a fully populated v2 config', () => {
    const populated = {
      version: 2,
      tz: 'America/New_York',
      global: { enabled: true },
      mute: { until: '2026-12-31T23:59:59.000Z' },
      schedules: [
        {
          id: 'work',
          type: 'allow' as const,
          days: ['mon' as const, 'tue' as const, 'wed' as const, 'thu' as const, 'fri' as const],
          from: '09:00',
          to: '18:00',
        },
      ],
      tools: {
        'claude-code': { enabled: true },
        codex: { enabled: false },
        gemini: { enabled: true },
        opencode: { enabled: true },
      },
      projectDefault: { enabled: false },
      projects: { '/Users/me/work/foo': { enabled: true, kinds: ['PERMISSION' as const] } },
      idleGate: {
        mode: 'strict-terminal' as const,
        thresholdSeconds: 30,
        unsupportedTerminalPolicy: 'gate' as const,
      },
      sound: { darwin: 'Glass', win32: 'ms-winsoundevent:Notification.IM' },
      icon: { darwin: '/Users/me/icons/agent.png', win32: 'C:\\\\icons\\\\agent.ico' },
      logging: { maxBytes: 2_000_000, generations: 5 },
    };
    const c = ConfigSchema.parse(populated);
    expect(c).toEqual(populated);
  });

  it('rejects unknown nested fields under strict zod', () => {
    expect(() =>
      ConfigSchema.parse({
        version: 2,
        tz: 'UTC',
        idleGate: { thrshold: 60 } as unknown as Record<string, unknown>,
      }),
    ).toThrow();
  });
});
