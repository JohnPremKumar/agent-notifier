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

export const ConfigSchema = z.object({
  version: z.literal(1),
  tz: z.string().min(1),
  global: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  mute: z.object({ until: z.string().datetime() }).nullable().default(null),
  schedules: z.array(ScheduleRuleSchema).default([]),
  tools: z.record(ToolNameSchema, z.object({ enabled: z.boolean() })).default({
    'claude-code': { enabled: true },
    codex: { enabled: true },
    gemini: { enabled: true },
    opencode: { enabled: true },
  }),
  projectDefault: z.object({ enabled: z.boolean() }).default({ enabled: true }),
  projects: z.record(z.string(), ProjectEntrySchema).default({}),
});
export type Config = z.infer<typeof ConfigSchema>;
