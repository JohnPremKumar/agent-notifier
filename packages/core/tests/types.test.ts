import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { EventSchema, ConfigSchema, KindSchema, ToolNameSchema } from '../src/types.js';

// ─── temp file helper ─────────────────────────────────────────────────────────

const tmpFile = (ext: string): string => {
  const f = join(tmpdir(), `agent-notifier-test-${randomBytes(4).toString('hex')}${ext}`);
  writeFileSync(f, '');
  return f;
};

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
    // Use real temp files for icon paths — existsSync is applied by Task-13 refinements.
    const darwinIconPath = tmpFile('.png');
    const win32IconPath = tmpFile('.ico');
    try {
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
        icon: { darwin: darwinIconPath, win32: win32IconPath },
        logging: { maxBytes: 2_000_000, generations: 5 },
      };
      const c = ConfigSchema.parse(populated);
      expect(c).toEqual(populated);
    } finally {
      unlinkSync(darwinIconPath);
      unlinkSync(win32IconPath);
    }
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

// ─── sound.darwin refinement ──────────────────────────────────────────────────

describe('sound.darwin refinement', () => {
  const parse = (darwin: string) =>
    ConfigSchema.parse({ version: 2, tz: 'UTC', sound: { darwin } });

  it('accepts built-in name Ping', () => {
    expect(parse('Ping').sound.darwin).toBe('Ping');
  });

  it('accepts built-in name Sosumi', () => {
    expect(parse('Sosumi').sound.darwin).toBe('Sosumi');
  });

  it('accepts absolute path to existing .aiff file', () => {
    const f = tmpFile('.aiff');
    try {
      expect(parse(f).sound.darwin).toBe(f);
    } finally {
      unlinkSync(f);
    }
  });

  it('accepts absolute path to existing .caf file', () => {
    const f = tmpFile('.caf');
    try {
      expect(parse(f).sound.darwin).toBe(f);
    } finally {
      unlinkSync(f);
    }
  });

  it('rejects absolute path to missing .aiff file', () => {
    const f = join(tmpdir(), `agent-notifier-test-missing-${randomBytes(4).toString('hex')}.aiff`);
    // intentionally NOT created — must not exist
    expect(() => parse(f)).toThrow(/not found/i);
  });

  it('rejects absolute path with wrong extension', () => {
    const f = tmpFile('.wrong');
    try {
      expect(() => parse(f)).toThrow(/must end .aiff or .caf/i);
    } finally {
      unlinkSync(f);
    }
  });

  it('rejects lowercase name (not PascalCase)', () => {
    expect(() => parse('lowercase')).toThrow();
  });

  it('rejects multi-word string with space (not PascalCase single word)', () => {
    expect(() => parse('Two Words')).toThrow();
  });
});

// ─── sound.win32 refinement ───────────────────────────────────────────────────

describe('sound.win32 refinement', () => {
  const parse = (win32: string) => ConfigSchema.parse({ version: 2, tz: 'UTC', sound: { win32 } });

  it('accepts ms-winsoundevent:Notification.Default', () => {
    expect(parse('ms-winsoundevent:Notification.Default').sound.win32).toBe(
      'ms-winsoundevent:Notification.Default',
    );
  });

  it('accepts ms-winsoundevent:Notification.Looping.Alarm', () => {
    expect(parse('ms-winsoundevent:Notification.Looping.Alarm').sound.win32).toBe(
      'ms-winsoundevent:Notification.Looping.Alarm',
    );
  });

  it('accepts absolute path to existing .wav file', () => {
    const f = tmpFile('.wav');
    try {
      expect(parse(f).sound.win32).toBe(f);
    } finally {
      unlinkSync(f);
    }
  });

  it('rejects absolute path to missing .wav file', () => {
    const f = join(tmpdir(), `agent-notifier-test-missing-${randomBytes(4).toString('hex')}.wav`);
    // intentionally NOT created
    expect(() => parse(f)).toThrow(/not found/i);
  });

  it('rejects plain string without prefix or path', () => {
    expect(() => parse('plain-string')).toThrow();
  });
});

// ─── icon.darwin refinement ───────────────────────────────────────────────────

describe('icon.darwin refinement', () => {
  const parse = (darwin: string | null) =>
    ConfigSchema.parse({ version: 2, tz: 'UTC', icon: { darwin } });

  it('accepts default null', () => {
    expect(parse(null).icon.darwin).toBeNull();
  });

  it('accepts absolute path to existing .png file', () => {
    const f = tmpFile('.png');
    try {
      expect(parse(f).icon.darwin).toBe(f);
    } finally {
      unlinkSync(f);
    }
  });

  it('accepts absolute path to existing .icns file', () => {
    const f = tmpFile('.icns');
    try {
      expect(parse(f).icon.darwin).toBe(f);
    } finally {
      unlinkSync(f);
    }
  });

  it('rejects absolute path to missing .png file', () => {
    const f = join(tmpdir(), `agent-notifier-test-missing-${randomBytes(4).toString('hex')}.png`);
    expect(() => parse(f)).toThrow(/not found/i);
  });

  it('rejects relative path', () => {
    expect(() => parse('relative/path.png')).toThrow(/must be absolute/i);
  });

  it('rejects existing file with wrong extension', () => {
    const f = tmpFile('.jpg');
    try {
      expect(() => parse(f)).toThrow(/must end .png or .icns/i);
    } finally {
      unlinkSync(f);
    }
  });
});

// ─── icon.win32 refinement ────────────────────────────────────────────────────

describe('icon.win32 refinement', () => {
  const parse = (win32: string | null) =>
    ConfigSchema.parse({ version: 2, tz: 'UTC', icon: { win32 } });

  it('accepts default null', () => {
    expect(parse(null).icon.win32).toBeNull();
  });

  it('accepts absolute path to existing .ico file', () => {
    const f = tmpFile('.ico');
    try {
      expect(parse(f).icon.win32).toBe(f);
    } finally {
      unlinkSync(f);
    }
  });

  it('rejects absolute path to missing .ico file', () => {
    const f = join(tmpdir(), `agent-notifier-test-missing-${randomBytes(4).toString('hex')}.ico`);
    expect(() => parse(f)).toThrow(/not found/i);
  });

  it('rejects relative path', () => {
    expect(() => parse('relative.ico')).toThrow(/must be absolute/i);
  });
});

// ─── afterEach safety net ─────────────────────────────────────────────────────
// Individual tests use try/finally, but this catches any leaked descriptors.
afterEach(() => {
  // no-op — cleanup is done inline per test with try/finally
});
