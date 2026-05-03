// packages/core/tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, defaultConfig, ConfigStore } from '../src/config.js';

describe('config', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentcfg-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaultConfig produces a valid Config with sane defaults', () => {
    const c = defaultConfig('Asia/Kolkata');
    expect(c.version).toBe(2);
    expect(c.tz).toBe('Asia/Kolkata');
    expect(c.global.enabled).toBe(true);
    expect(c.mute).toBeNull();
  });

  it('loadConfig returns defaultConfig when file absent', () => {
    const c = loadConfig(file, 'UTC');
    expect(c.tz).toBe('UTC');
    expect(existsSync(file)).toBe(false);
  });

  it('saveConfig writes valid JSON and loadConfig round-trips it', () => {
    const original = defaultConfig('UTC');
    original.projects['/Users/x/repo'] = { enabled: false };
    saveConfig(file, original);
    const loaded = loadConfig(file, 'UTC');
    expect(loaded.projects['/Users/x/repo']?.enabled).toBe(false);
  });

  it('loadConfig throws on schema-invalid file (no silent corruption)', () => {
    writeFileSync(file, '{"version":1,"tz":"UTC","global":"not-an-object"}');
    expect(() => loadConfig(file, 'UTC')).toThrow();
  });

  it('saveConfig is atomic: tmp file is removed after rename', () => {
    saveConfig(file, defaultConfig('UTC'));
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('ConfigStore.update mutates and persists', () => {
    saveConfig(file, defaultConfig('UTC'));
    const store = new ConfigStore(file, 'UTC');
    store.update((c) => {
      c.global.enabled = false;
    });
    const reloaded = loadConfig(file, 'UTC');
    expect(reloaded.global.enabled).toBe(false);
  });
});
