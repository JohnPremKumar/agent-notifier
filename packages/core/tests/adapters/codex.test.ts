import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCodex } from '../../src/adapters/codex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'codex', name), 'utf8'));

describe('codex adapter', () => {
  it('classifies PermissionRequest as PERMISSION', () => {
    const e = classifyCodex(load('permission_request.json'));
    expect(e?.kind).toBe('PERMISSION');
    expect(e?.tool).toBe('codex');
    expect(e?.project).toBe('codex-app');
    expect(e?.sessionId).toBe('cdx-9001');
  });

  it('classifies Stop as TURN_DONE', () => {
    const e = classifyCodex(load('stop.json'));
    expect(e?.kind).toBe('TURN_DONE');
  });

  it('returns null for unsupported events', () => {
    expect(classifyCodex({ event: 'PreToolUse', session_id: 's', cwd: '/x' })).toBeNull();
  });

  it('returns null for malformed payloads', () => {
    expect(classifyCodex({})).toBeNull();
    expect(classifyCodex(undefined)).toBeNull();
  });

  it('attaches truncated command preview to message', () => {
    const e = classifyCodex(load('permission_request.json'));
    expect(e?.message).toContain('rm');
  });
});
