import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('CLI: --version and --help', () => {
  it('--version prints semver', () => {
    const out = execFileSync('node', [BIN, '--version'], { encoding: 'utf8' });
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help lists every subcommand', () => {
    const out = execFileSync('node', [BIN, '--help'], { encoding: 'utf8' });
    for (const cmd of [
      'init',
      'install',
      'uninstall',
      'doctor',
      'status',
      'enable',
      'disable',
      'mute',
      'unmute',
      'schedule',
      'logs',
      'hook',
    ]) {
      expect(out).toContain(cmd);
    }
  });

  it('unknown subcommand exits non-zero', () => {
    expect(() => execFileSync('node', [BIN, 'no-such-thing'], { encoding: 'utf8' })).toThrow();
  });
});
