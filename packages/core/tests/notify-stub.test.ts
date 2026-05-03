import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stubNotifyAppend } from '../src/notify-stub.js';
import type { Event } from '../src/types.js';

describe('stubNotifyAppend', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'an-stub-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const ev: Event = {
    kind: 'TURN_DONE',
    tool: 'claude-code',
    project: 'p',
    sessionId: 's',
    cwd: '/tmp',
    message: 'm',
  };

  it('appends a line for each event', () => {
    stubNotifyAppend(dir, ev);
    stubNotifyAppend(dir, ev);
    const file = join(dir, 'stub-notifications.jsonl');
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
  });

  it('truncates when 256 KB cap is exceeded', () => {
    const big: Event = { ...ev, message: 'x'.repeat(2048) };
    for (let i = 0; i < 200; i++) stubNotifyAppend(dir, big);
    const file = join(dir, 'stub-notifications.jsonl');
    expect(statSync(file).size).toBeLessThanOrEqual(256 * 1024);
  });

  it('creates the directory if missing', () => {
    rmSync(dir, { recursive: true, force: true });
    // dir no longer exists; helper should recreate
    stubNotifyAppend(dir, ev);
    expect(existsSync(join(dir, 'stub-notifications.jsonl'))).toBe(true);
  });
});
