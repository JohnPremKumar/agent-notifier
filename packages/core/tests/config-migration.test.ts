import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig } from '../src/config.js';

describe('config migration v1 → v2', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'an-cfg-'));
    file = join(dir, 'config.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('upgrades v1 config to v2 on load with defaults applied', () => {
    writeFileSync(file, JSON.stringify({ version: 1, tz: 'UTC' }), 'utf8');
    const c = loadConfig(file, 'UTC');
    expect(c.version).toBe(2);
    expect(c.idleGate.mode).toBe('fire-elsewhere');
    expect(c.sound.darwin).toBe('Ping');
  });

  it('writes <file>.v1.bak exactly once on first migration', () => {
    writeFileSync(file, JSON.stringify({ version: 1, tz: 'UTC' }), 'utf8');
    loadConfig(file, 'UTC');
    expect(existsSync(`${file}.v1.bak`)).toBe(true);
    const backup = readFileSync(`${file}.v1.bak`, 'utf8');
    expect(JSON.parse(backup)).toMatchObject({ version: 1 });

    // Re-load (config is now v2) — backup must NOT be overwritten or duplicated
    const c2 = loadConfig(file, 'UTC');
    saveConfig(file, c2);
    loadConfig(file, 'UTC');
    expect(existsSync(`${file}.v1.bak`)).toBe(true);
  });

  it('passes through v2 unchanged', () => {
    const v2 = { version: 2, tz: 'UTC' };
    writeFileSync(file, JSON.stringify(v2), 'utf8');
    const c = loadConfig(file, 'UTC');
    expect(c.version).toBe(2);
    expect(existsSync(`${file}.v1.bak`)).toBe(false);
  });
});
