import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyOpenCode, OPENCODE_PLUGIN_SOURCE } from '../../src/adapters/opencode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'opencode', name), 'utf8'));

describe('opencode adapter', () => {
  it('classifies permission.ask as PERMISSION', () => {
    const e = classifyOpenCode(load('permission.json'));
    expect(e?.kind).toBe('PERMISSION');
    expect(e?.sessionId).toBe('oc-7');
    expect(e?.tool).toBe('opencode');
  });

  it('classifies session.idle as TURN_DONE', () => {
    expect(classifyOpenCode(load('session_idle.json'))?.kind).toBe('TURN_DONE');
  });

  it('returns null for irrelevant events', () => {
    expect(classifyOpenCode({ type: 'tool.executed', sessionID: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(classifyOpenCode({})).toBeNull();
  });

  it('plugin source contains the binary invocation and both event hooks', () => {
    expect(OPENCODE_PLUGIN_SOURCE).toContain('agent-notifier');
    expect(OPENCODE_PLUGIN_SOURCE).toContain("'--tool'");
    expect(OPENCODE_PLUGIN_SOURCE).toContain("'opencode'");
    expect(OPENCODE_PLUGIN_SOURCE).toContain("'permission.ask'");
    expect(OPENCODE_PLUGIN_SOURCE).toContain("'session.idle'");
  });
});
