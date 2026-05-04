import { z } from 'zod';
import { existsSync } from 'node:fs';

const isAbsPath = (s: string): boolean => s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s);
const macBuiltinSoundRe = /^[A-Z][a-z]+$/;
const macSoundExtRe = /\.(aiff|caf)$/i;
const winSoundExtRe = /\.wav$/i;
const macIconExtRe = /\.(png|icns)$/i;
const winIconExtRe = /\.ico$/i;

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

    // sound and icon: built-in name OR absolute path; refined at parse/save time
    // (mac built-in regex /^[A-Z][a-z]+$/, .aiff/.caf for custom mac sound,
    // ms-winsoundevent:* prefix or .wav path for win sound, .png/.icns mac icon,
    // .ico win icon; existsSync() check for any custom file path).
    sound: z
      .object({
        darwin: z
          .string()
          .min(1)
          .default('Ping')
          .superRefine((v, ctx) => {
            if (isAbsPath(v)) {
              if (!macSoundExtRe.test(v)) {
                ctx.addIssue({
                  code: 'custom',
                  message: `mac sound path must end .aiff or .caf: ${v}`,
                });
                return;
              }
              if (!existsSync(v)) {
                ctx.addIssue({ code: 'custom', message: `mac sound file not found: ${v}` });
              }
            } else if (!macBuiltinSoundRe.test(v)) {
              ctx.addIssue({
                code: 'custom',
                message: `'${v}' is not a built-in mac sound name (PascalCase like 'Ping') or absolute path to .aiff/.caf`,
              });
            }
          }),
        win32: z
          .string()
          .min(1)
          .default('ms-winsoundevent:Notification.Default')
          .superRefine((v, ctx) => {
            if (v.startsWith('ms-winsoundevent:')) return;
            if (!isAbsPath(v)) {
              ctx.addIssue({
                code: 'custom',
                message: `win sound must be 'ms-winsoundevent:*' or absolute path to .wav: ${v}`,
              });
              return;
            }
            if (!winSoundExtRe.test(v)) {
              ctx.addIssue({ code: 'custom', message: `win sound path must end .wav: ${v}` });
              return;
            }
            if (!existsSync(v)) {
              ctx.addIssue({ code: 'custom', message: `win sound file not found: ${v}` });
            }
          }),
      })
      .strict()
      .default({}),

    icon: z
      .object({
        darwin: z
          .string()
          .min(1)
          .nullable()
          .default(null)
          .superRefine((v, ctx) => {
            if (v === null) return;
            if (!isAbsPath(v)) {
              ctx.addIssue({ code: 'custom', message: `mac icon must be absolute path: ${v}` });
              return;
            }
            if (!macIconExtRe.test(v)) {
              ctx.addIssue({
                code: 'custom',
                message: `mac icon must end .png or .icns: ${v}`,
              });
              return;
            }
            if (!existsSync(v)) {
              ctx.addIssue({ code: 'custom', message: `mac icon file not found: ${v}` });
            }
          }),
        win32: z
          .string()
          .min(1)
          .nullable()
          .default(null)
          .superRefine((v, ctx) => {
            if (v === null) return;
            if (!isAbsPath(v)) {
              ctx.addIssue({ code: 'custom', message: `win icon must be absolute path: ${v}` });
              return;
            }
            if (!winIconExtRe.test(v)) {
              ctx.addIssue({ code: 'custom', message: `win icon must end .ico: ${v}` });
              return;
            }
            if (!existsSync(v)) {
              ctx.addIssue({ code: 'custom', message: `win icon file not found: ${v}` });
            }
          }),
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
