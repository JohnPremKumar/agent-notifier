import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

interface MuteCfg {
  mute: { until: string } | null;
}

describe('mute / unmute', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentmute-'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));
  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });
  const cfg = () =>
    JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8')) as MuteCfg;

  it('mute 30m sets mute.until ~30 min in the future', () => {
    execFileSync('node', [BIN, 'mute', '30m'], { env: env() });
    const dt = new Date(cfg().mute!.until).getTime() - Date.now();
    expect(dt).toBeGreaterThan(28 * 60_000);
    expect(dt).toBeLessThan(31 * 60_000);
  });

  it('unmute clears mute', () => {
    execFileSync('node', [BIN, 'mute', '1h'], { env: env() });
    execFileSync('node', [BIN, 'unmute'], { env: env() });
    expect(cfg().mute).toBeNull();
  });

  it('mute with garbage exits non-zero', () => {
    expect(() => execFileSync('node', [BIN, 'mute', 'garbage'], { env: env() })).toThrow();
  });
});
