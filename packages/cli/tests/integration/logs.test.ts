import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('logs', () => {
  let home: string;
  let logFile: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentlog-'));
    mkdirSync(join(home, '.agent-notifier', 'log'), { recursive: true });
    logFile = join(home, '.agent-notifier', 'log', 'notifier.log');
    const lines =
      [
        {
          ts: '2026-05-04T09:00:00Z',
          tool: 'claude-code',
          kind: 'PERMISSION',
          project: 'a',
          sessionId: 's1',
          fired: true,
        },
        {
          ts: '2026-05-04T09:01:00Z',
          tool: 'codex',
          kind: 'IDLE',
          project: 'a',
          sessionId: 's2',
          fired: false,
          suppressReason: 'user-active',
        },
        {
          ts: '2026-05-04T09:02:00Z',
          tool: 'gemini',
          kind: 'TURN_DONE',
          project: 'b',
          sessionId: 's3',
          fired: true,
        },
        {
          ts: '2026-05-04T09:03:00Z',
          tool: 'claude-code',
          kind: 'TURN_DONE',
          project: 'a',
          sessionId: 's4',
          fired: true,
        },
      ]
        .map((o) => JSON.stringify(o))
        .join('\n') + '\n';
    writeFileSync(logFile, lines);
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  it('--tail 2 prints the last 2 entries', () => {
    const out = execFileSync('node', [BIN, 'logs', '--tail', '2'], {
      env: env(),
      encoding: 'utf8',
    });
    expect(out.split('\n').filter(Boolean)).toHaveLength(2);
    expect(out).toContain('s3');
    expect(out).toContain('s4');
  });

  it('--tool codex filters to codex entries only', () => {
    const out = execFileSync('node', [BIN, 'logs', '--tool', 'codex'], {
      env: env(),
      encoding: 'utf8',
    });
    expect(out).toContain('codex');
    expect(out).not.toContain('claude-code');
  });

  it('--kind PERMISSION filters by kind', () => {
    const out = execFileSync('node', [BIN, 'logs', '--kind', 'PERMISSION'], {
      env: env(),
      encoding: 'utf8',
    });
    expect(out).toContain('PERMISSION');
    expect(out).not.toContain('IDLE');
  });

  it('--suppressed shows only suppressed', () => {
    const out = execFileSync('node', [BIN, 'logs', '--suppressed'], {
      env: env(),
      encoding: 'utf8',
    });
    expect(out).toContain('user-active');
    expect(out).not.toContain('s1');
  });

  it('--fired shows only fired', () => {
    const out = execFileSync('node', [BIN, 'logs', '--fired'], { env: env(), encoding: 'utf8' });
    expect(out).not.toContain('user-active');
    expect(out).toContain('s1');
  });

  it('--json emits raw JSONL', () => {
    const out = execFileSync('node', [BIN, 'logs', '--json'], { env: env(), encoding: 'utf8' });
    for (const line of out.split('\n').filter(Boolean)) JSON.parse(line);
  });
});
