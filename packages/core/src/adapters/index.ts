import type { Event, ToolName } from '../types.js';
import { classifyClaudeCode } from './claude-code.js';
import { classifyCodex } from './codex.js';
import { classifyGemini } from './gemini.js';
import { classifyOpenCode } from './opencode.js';

export type Classifier = (payload: unknown) => Event | null;

export const adapters: Record<ToolName, Classifier> = {
  'claude-code': classifyClaudeCode,
  codex: classifyCodex,
  gemini: classifyGemini,
  opencode: classifyOpenCode,
};

export { OPENCODE_PLUGIN_SOURCE } from './opencode.js';
