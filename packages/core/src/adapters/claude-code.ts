import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  hook_event_name: z.string(),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  message: z.string().optional(),
});

const PERMISSION_RE = /permission/i;
const IDLE_RE = /waiting.*input/i;

export function classifyClaudeCode(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { hook_event_name, session_id, cwd, message } = parsed.data;

  const base = {
    tool: 'claude-code' as const,
    project: basename(cwd),
    sessionId: session_id,
    cwd,
    ...(message !== undefined && { message }),
  };

  if (hook_event_name === 'Stop') return { ...base, kind: 'TURN_DONE' };
  if (hook_event_name === 'Notification' && message) {
    if (PERMISSION_RE.test(message)) return { ...base, kind: 'PERMISSION' };
    if (IDLE_RE.test(message)) return { ...base, kind: 'IDLE' };
  }
  return null;
}
