import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGemini } from '../../src/adapters/gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'gemini', name), 'utf8'));

describe('gemini adapter', () => {
  it('classifies tool_confirmation Notification as PERMISSION', () => {
    expect(classifyGemini(load('notification_perm.json'))?.kind).toBe('PERMISSION');
  });

  it('classifies idle Notification as IDLE', () => {
    expect(classifyGemini(load('notification_idle.json'))?.kind).toBe('IDLE');
  });

  it('classifies AfterAgent as TURN_DONE', () => {
    expect(classifyGemini(load('after_agent.json'))?.kind).toBe('TURN_DONE');
  });

  it('returns null for irrelevant events', () => {
    expect(classifyGemini({ event_name: 'BeforeTool', session_id: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(classifyGemini({})).toBeNull();
    expect(classifyGemini(42)).toBeNull();
  });
});
