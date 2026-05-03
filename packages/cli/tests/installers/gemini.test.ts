import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGeminiInstaller } from '../../src/lib/installers/gemini.js';

describe('gemini installer', () => {
  let home: string; let path: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentgem-'));
    mkdirSync(join(home, '.gemini'));
    path = join(home, '.gemini', 'settings.json');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createGeminiInstaller({ home });

  it('install creates settings.json with Notification + AfterAgent hooks', async () => {
    await inst().install();
    const s = JSON.parse(readFileSync(path, 'utf8')) as { hooks: Record<string, unknown> };
    expect(s.hooks['Notification']).toBeDefined();
    expect(s.hooks['AfterAgent']).toBeDefined();
  });

  it('install merges into existing settings.json without dropping user keys', async () => {
    writeFileSync(path, JSON.stringify({ theme: 'dark' }));
    await inst().install();
    const s = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(s['theme']).toBe('dark');
  });

  it('install is idempotent', async () => {
    await inst().install();
    const a = readFileSync(path, 'utf8');
    await inst().install();
    expect(readFileSync(path, 'utf8')).toBe(a);
  });

  it('uninstall restores byte-for-byte', async () => {
    const orig = JSON.stringify({ theme: 'dark' }, null, 2);
    writeFileSync(path, orig);
    await inst().install();
    await inst().uninstall();
    expect(readFileSync(path, 'utf8')).toBe(orig);
  });
});
