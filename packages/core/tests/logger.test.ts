// packages/core/tests/logger.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, type LogEntry } from '../src/logger.js';

describe('Logger', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentlog-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends one JSONL line per write', () => {
    const log = new Logger({ dir, maxBytes: 10_000, generations: 3 });
    log.append({
      ts: '2026-05-03T10:00:00Z',
      tool: 'claude-code',
      kind: 'PERMISSION',
      project: 'x',
      sessionId: 's1',
      fired: true,
    });
    log.append({
      ts: '2026-05-03T10:00:01Z',
      tool: 'codex',
      kind: 'IDLE',
      project: 'y',
      sessionId: 's2',
      fired: false,
      suppressReason: 'user-active',
    });
    const lines = readFileSync(join(dir, 'notifier.log'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0]!) as LogEntry).tool).toBe('claude-code');
    expect((JSON.parse(lines[1]!) as LogEntry).suppressReason).toBe('user-active');
  });

  it('rotates when size exceeds maxBytes (1 → 2 → 3 → drop)', () => {
    const log = new Logger({ dir, maxBytes: 200, generations: 3 });
    const big = 'x'.repeat(150);
    for (let i = 0; i < 6; i++) {
      log.append({
        ts: `2026-05-03T10:00:0${i}Z`,
        tool: 'claude-code',
        kind: 'PERMISSION',
        project: 'p',
        sessionId: 's',
        fired: true,
        msg: big,
      });
    }
    expect(existsSync(join(dir, 'notifier.log'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.1'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.2'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.3'))).toBe(false);
  });

  it('caps generations at the configured count', () => {
    const log = new Logger({ dir, maxBytes: 50, generations: 2 });
    for (let i = 0; i < 8; i++) {
      log.append({
        ts: '2026-05-03T10:00:00Z',
        tool: 'claude-code',
        kind: 'PERMISSION',
        project: 'p',
        sessionId: 's',
        fired: true,
      });
    }
    expect(existsSync(join(dir, 'notifier.log.1'))).toBe(true);
    expect(existsSync(join(dir, 'notifier.log.2'))).toBe(false);
  });

  it('creates the log directory if missing', () => {
    const nested = join(dir, 'a', 'b', 'c');
    const log = new Logger({ dir: nested, maxBytes: 1000, generations: 3 });
    log.append({
      ts: '2026-05-03T10:00:00Z',
      tool: 'claude-code',
      kind: 'IDLE',
      project: 'p',
      sessionId: 's',
      fired: true,
    });
    expect(statSync(join(nested, 'notifier.log')).size).toBeGreaterThan(0);
  });

  it('readTail returns the last N entries newest-last', () => {
    const log = new Logger({ dir, maxBytes: 100_000, generations: 3 });
    for (let i = 0; i < 5; i++) {
      log.append({
        ts: `2026-05-03T10:00:0${i}Z`,
        tool: 'claude-code',
        kind: 'PERMISSION',
        project: 'p',
        sessionId: `s${i}`,
        fired: true,
      });
    }
    const tail = log.readTail(3);
    expect(tail).toHaveLength(3);
    expect(tail[0]!.sessionId).toBe('s2');
    expect(tail[2]!.sessionId).toBe('s4');
  });

  it('readAll skips malformed lines without throwing', () => {
    writeFileSync(join(dir, 'notifier.log'), '{"ts":"a"}\nNOT JSON\n{"ts":"b"}\n');
    const log = new Logger({ dir, maxBytes: 100_000, generations: 3 });
    const all = log.readAll();
    expect(all).toHaveLength(2);
  });
});
