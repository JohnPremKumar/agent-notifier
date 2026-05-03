import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenCodeInstaller } from '../../src/lib/installers/opencode.js';

describe('opencode installer', () => {
  let home: string;
  let userConfigDir: string;
  let pluginDir: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentoc-'));
    userConfigDir = join(home, '.config', 'opencode');
    pluginDir = join(userConfigDir, 'plugins');
    mkdirSync(userConfigDir, { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createOpenCodeInstaller({ home });

  it('install creates the plugins dir and writes the plugin file', async () => {
    await inst().install();
    const file = join(pluginDir, 'agent-notifier.js');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain('agent-notifier');
  });

  it('install is idempotent (overwrites with same content)', async () => {
    await inst().install();
    const a = readFileSync(join(pluginDir, 'agent-notifier.js'), 'utf8');
    await inst().install();
    expect(readFileSync(join(pluginDir, 'agent-notifier.js'), 'utf8')).toBe(a);
  });

  it('uninstall removes the plugin file', async () => {
    await inst().install();
    await inst().uninstall();
    expect(existsSync(join(pluginDir, 'agent-notifier.js'))).toBe(false);
  });

  it('detect: true when the user-config dir exists (independent of plugins/)', async () => {
    expect(await inst().detect()).toBe(true);
    rmSync(userConfigDir, { recursive: true });
    expect(await inst().detect()).toBe(false);
  });
});
