import { basename } from 'node:path';
import { z } from 'zod';
import type { Event } from '../types.js';

const PayloadSchema = z.object({
  type: z.string(),
  sessionID: z.string().min(1),
  cwd: z.string().min(1),
  tool: z.string().optional(),
});

export function classifyOpenCode(payload: unknown): Event | null {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { type, sessionID, cwd, tool } = parsed.data;

  const base = {
    tool: 'opencode' as const,
    project: basename(cwd),
    sessionId: sessionID,
    cwd,
    ...(tool !== undefined && { message: tool }),
  };

  if (type === 'permission.requested') return { ...base, kind: 'PERMISSION' };
  if (type === 'session.completed') return { ...base, kind: 'TURN_DONE' };
  return null;
}

export const OPENCODE_PLUGIN_SOURCE = `// agent-notifier opencode plugin (auto-generated; do not edit)
// Usage: agent-notifier hook --tool opencode
import { spawn } from 'node:child_process';

export default function agentNotifier({ app }) {
  const fire = (type, ev) => {
    const payload = JSON.stringify({ type, sessionID: ev.sessionID, cwd: ev.cwd ?? process.cwd(), tool: ev.tool });
    const p = spawn('agent-notifier', ['hook', '--tool', 'opencode'], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    p.stdin.end(payload);
    p.unref();
  };
  return {
    'permission.requested': (ev) => fire('permission.requested', ev),
    'session.completed':    (ev) => fire('session.completed', ev),
  };
}
`;
