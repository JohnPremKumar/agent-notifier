import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  event: z.string(),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  tool: z.string().optional(),
  command: z.array(z.string()).optional(),
});

export function classifyCodex(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { event, session_id, cwd, tool, command } = parsed.data;

  const message =
    tool && command ? `${tool}: ${command.join(' ').slice(0, 80)}` : tool ? tool : undefined;

  const base = {
    tool: 'codex' as const,
    project: basename(cwd),
    sessionId: session_id,
    cwd,
    ...(message !== undefined && { message }),
  };

  if (event === 'PermissionRequest') return { ...base, kind: 'PERMISSION' };
  if (event === 'Stop') return { ...base, kind: 'TURN_DONE' };
  return null;
}
