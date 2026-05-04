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

  // Map the OpenCode plugin event names (Hooks API in @opencode-ai/plugin)
  // to our internal Event kinds. `permission.ask` is a typed Hooks key;
  // `session.idle` arrives via the catch-all `event` hook in the plugin.
  if (type === 'permission.ask') return { ...base, kind: 'PERMISSION' };
  if (type === 'session.idle') return { ...base, kind: 'TURN_DONE' };
  return null;
}

// Plugin contract: @opencode-ai/plugin@1.4.7
//   Plugin = (input: PluginInput, options?) => Promise<Hooks>
//   Auto-loaded from ~/.config/opencode/plugins/*.js (no opencode.json registration needed).
//   Hooks supports `permission.ask` directly; `session.idle` is delivered
//   via the generic `event` catch-all (not a top-level key).
export const OPENCODE_PLUGIN_SOURCE = `// agent-notifier opencode plugin (auto-generated; do not edit)
// Triggers desktop notifications via the agent-notifier CLI on permission
// asks and session-idle (turn-done) events.
import { spawn } from 'node:child_process';

export const AgentNotifier = async ({ directory }) => {
  const fire = (payload) => {
    const child = spawn('agent-notifier', ['hook', '--tool', 'opencode'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      detached: true,
    });
    child.stdin.end(JSON.stringify(payload));
    child.unref();
  };
  return {
    'permission.ask': async (input) => {
      fire({
        type: 'permission.ask',
        sessionID: input.sessionID,
        cwd: directory,
        tool: input.title,
      });
    },
    event: async ({ event }) => {
      if (event.type === 'session.idle') {
        fire({
          type: 'session.idle',
          sessionID: event.properties.sessionID,
          cwd: directory,
        });
      }
    },
  };
};
`;
