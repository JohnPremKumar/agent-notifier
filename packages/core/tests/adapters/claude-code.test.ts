import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyClaudeCode } from '../../src/adapters/claude-code.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'claude-code', name), 'utf8'));

describe('claude-code adapter', () => {
  it('classifies permission notification', () => {
    const e = classifyClaudeCode(load('permission.json'));
    expect(e?.kind).toBe('PERMISSION');
    expect(e?.tool).toBe('claude-code');
    expect(e?.project).toBe('my-app');
    expect(e?.sessionId).toBe('abc123def');
  });

  it('classifies idle notification', () => {
    expect(classifyClaudeCode(load('idle.json'))?.kind).toBe('IDLE');
  });

  it('classifies stop event as TURN_DONE', () => {
    expect(classifyClaudeCode(load('stop.json'))?.kind).toBe('TURN_DONE');
  });

  it('returns null for unknown event names', () => {
    expect(
      classifyClaudeCode({ hook_event_name: 'PreToolUse', session_id: 's', cwd: '/x' }),
    ).toBeNull();
  });

  it('returns null for malformed payloads (missing required fields)', () => {
    expect(classifyClaudeCode({})).toBeNull();
    expect(classifyClaudeCode(null)).toBeNull();
    expect(classifyClaudeCode('not an object')).toBeNull();
  });

  it('disambiguates Notification by message text', () => {
    const ambiguous = {
      hook_event_name: 'Notification',
      session_id: 's',
      cwd: '/x',
      message: 'something else',
    };
    expect(classifyClaudeCode(ambiguous)).toBeNull();
  });
});
