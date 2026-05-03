import { z } from 'zod';

export const KindSchema = z.enum(['PERMISSION', 'IDLE', 'TURN_DONE']);
export type Kind = z.infer<typeof KindSchema>;

export const ToolNameSchema = z.enum(['claude-code', 'codex', 'gemini', 'opencode']);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const EventSchema = z.object({
  kind: KindSchema,
  tool: ToolNameSchema,
  project: z.string().min(1),
  sessionId: z.string().min(1),
  cwd: z.string().min(1),
  message: z.string().optional(),
});
export type Event = z.infer<typeof EventSchema>;

const TimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const DaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const ScheduleRuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['allow', 'deny']),
  days: z.array(DaySchema).min(1),
  from: z.string().regex(TimeRegex),
  to: z.string().regex(TimeRegex),
});
export type ScheduleRule = z.infer<typeof ScheduleRuleSchema>;

export const ProjectEntrySchema = z.object({
  enabled: z.boolean(),
  kinds: z.array(KindSchema).optional(),
});
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;

export const IdleGateModeSchema = z.enum([
  'fire-elsewhere',
  'always-fire',
  'strict-terminal',
  'strict-os-idle',
]);
export type IdleGateMode = z.infer<typeof IdleGateModeSchema>;

export const UnsupportedTerminalPolicySchema = z.enum(['fire', 'gate']);
export type UnsupportedTerminalPolicy = z.infer<typeof UnsupportedTerminalPolicySchema>;

export const ConfigSchema = z
  .object({
    version: z.literal(2),
    tz: z.string().min(1),
    global: z.object({ enabled: z.boolean() }).strict().default({ enabled: true }),
    mute: z.object({ until: z.string().datetime() }).strict().nullable().default(null),
    schedules: z.array(ScheduleRuleSchema).default([]),
    tools: z.record(ToolNameSchema, z.object({ enabled: z.boolean() }).strict()).default({
      'claude-code': { enabled: true },
      codex: { enabled: true },
      gemini: { enabled: true },
      opencode: { enabled: true },
    }),
    projectDefault: z.object({ enabled: z.boolean() }).strict().default({ enabled: true }),
    projects: z.record(z.string(), ProjectEntrySchema).default({}),

    idleGate: z
      .object({
        mode: IdleGateModeSchema.default('fire-elsewhere'),
        thresholdSeconds: z.number().int().min(0).max(3600).default(60),
        unsupportedTerminalPolicy: UnsupportedTerminalPolicySchema.default('fire'),
      })
      .strict()
      .default({}),

    // sound and icon: extension/path validation added in Task 13 (zod refinements at config save).
    sound: z
      .object({
        darwin: z.string().min(1).default('Ping'),
        win32: z.string().min(1).default('ms-winsoundevent:Notification.Default'),
      })
      .strict()
      .default({}),

    icon: z
      .object({
        darwin: z.string().min(1).nullable().default(null),
        win32: z.string().min(1).nullable().default(null),
      })
      .strict()
      .default({}),

    logging: z
      .object({
        maxBytes: z.number().int().min(1024).max(100_000_000).default(1_000_000),
        generations: z.number().int().min(1).max(20).default(3),
      })
      .strict()
      .default({}),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;
