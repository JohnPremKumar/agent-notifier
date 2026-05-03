import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  event_name: z.string(),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  notification_type: z.string().optional(),
  message: z.string().optional(),
});

export function classifyGemini(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { event_name, session_id, cwd, notification_type, message } = parsed.data;

  const base = {
    tool: 'gemini' as const,
    project: basename(cwd),
    sessionId: session_id,
    cwd,
    ...(message !== undefined && { message }),
  };

  if (event_name === 'AfterAgent') return { ...base, kind: 'TURN_DONE' };
  if (event_name === 'Notification') {
    if (notification_type === 'tool_confirmation') return { ...base, kind: 'PERMISSION' };
    if (notification_type === 'idle') return { ...base, kind: 'IDLE' };
  }
  return null;
}
