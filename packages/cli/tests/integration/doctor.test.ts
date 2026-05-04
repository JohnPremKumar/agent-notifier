import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('doctor (stub notifier)', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentdoc-'));
    mkdirSync(join(home, '.claude'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const env = () => ({
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    AGENT_NOTIFIER_NOTIFY_IMPL: 'stub',
  });

  it('prints platform / version / config dir and fires three test notifications', () => {
    execFileSync('node', [BIN, 'install'], { env: env() });
    const out = execFileSync('node', [BIN, 'doctor'], { env: env(), encoding: 'utf8' });
    expect(out).toMatch(/agent-notifier/);
    expect(out).toMatch(/claude-code/);
    const stub = join(home, '.agent-notifier', 'stub-notifications.jsonl');
    expect(existsSync(stub)).toBe(true);
    const lines = readFileSync(stub, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { event: { kind: string } });
    const kinds = lines.map((l) => l.event.kind);
    expect(kinds).toContain('PERMISSION');
    expect(kinds).toContain('IDLE');
    expect(kinds).toContain('TURN_DONE');
  });

  it('exits 0 when at least one tool is wired', () => {
    execFileSync('node', [BIN, 'install'], { env: env() });
    const out = execFileSync('node', [BIN, 'doctor'], { env: env(), encoding: 'utf8' });
    expect(out).toBeDefined();
  });
});
