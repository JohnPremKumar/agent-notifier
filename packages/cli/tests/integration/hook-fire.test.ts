import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('hook → notify pipeline (stubbed notifier)', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agenthook-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    AGENT_NOTIFIER_NOTIFY_IMPL: 'stub',
    AGENT_NOTIFIER_IDLE_SECONDS: '60',
  });

  it('claude-code Stop event fires TURN_DONE notification (stub captures it)', () => {
    const payload = JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'integ-1',
      cwd: home,
    });
    const r = spawnSync('node', [BIN, 'hook', '--tool', 'claude-code'], {
      input: payload,
      env: env(),
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const stub = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stub)).toBe(true);
    const lines = readFileSync(stub, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const captured = JSON.parse(lines[0]!) as { event: { kind: string } };
    expect(captured.event.kind).toBe('TURN_DONE');
  });

  it('payload that does not classify exits 0 with no notification', () => {
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', cwd: home });
    const r = spawnSync('node', [BIN, 'hook', '--tool', 'claude-code'], {
      input: payload,
      env: env(),
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const stub = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stub)).toBe(false);
  });

  // Re-enabled in Task 5.1 once `disable --global` is implemented.
  it('respects global disable: writes log entry with reason but no stub notification', () => {
    // pre-disable via the CLI itself
    execFileSync('node', [BIN, 'disable', '--global'], { env: env(), stdio: 'ignore' });
    const payload = JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: home });
    spawnSync('node', [BIN, 'hook', '--tool', 'claude-code'], { input: payload, env: env() });
    const log = readFileSync(join(home, '.agent-notifier', 'log', 'notifier.log'), 'utf8');
    expect(log).toContain('global-disabled');
    expect(existsSync(join(home, '.agent-notifier', 'stub-notifications.jsonl'))).toBe(false);
  });
});
