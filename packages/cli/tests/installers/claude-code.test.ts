import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaudeCodeInstaller } from '../../src/lib/installers/claude-code.js';

describe('claude-code installer', () => {
  let home: string;
  let settingsPath: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentcc-'));
    mkdirSync(join(home, '.claude'));
    settingsPath = join(home, '.claude', 'settings.json');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createClaudeCodeInstaller({ home });

  it('detect: false when ~/.claude does not exist', async () => {
    rmSync(join(home, '.claude'), { recursive: true });
    expect(await inst().detect()).toBe(false);
  });

  it('detect: true when ~/.claude exists', async () => {
    expect(await inst().detect()).toBe(true);
  });

  it('install creates settings.json with hooks if it did not exist', async () => {
    await inst().install();
    expect(existsSync(settingsPath)).toBe(true);
    const s = JSON.parse(readFileSync(settingsPath, 'utf8')) as { hooks: Record<string, unknown> };
    expect(s.hooks).toBeDefined();
  });

  it('install merges into existing settings.json without losing user keys', async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ model: 'claude-opus-4-7', hooks: { PreToolUse: [] } }, null, 2),
    );
    await inst().install();
    const s = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
    expect(s['model']).toBe('claude-opus-4-7');
    expect(s['hooks']).toBeDefined();
  });

  it('install creates a .agent-notifier.bak backup of the original', async () => {
    writeFileSync(settingsPath, JSON.stringify({ model: 'x' }));
    await inst().install();
    const bak = readFileSync(`${settingsPath}.agent-notifier.bak`, 'utf8');
    expect(JSON.parse(bak)).toEqual({ model: 'x' });
  });

  it('install is idempotent (running twice does not duplicate hooks)', async () => {
    await inst().install();
    const after1 = readFileSync(settingsPath, 'utf8');
    await inst().install();
    const after2 = readFileSync(settingsPath, 'utf8');
    expect(after1).toBe(after2);
  });

  it('isWired: true after install', async () => {
    await inst().install();
    expect(await inst().isWired()).toBe(true);
  });

  it('uninstall restores settings.json byte-for-byte from the .bak', async () => {
    const original = JSON.stringify({ model: 'x', hooks: { PreToolUse: [] } }, null, 2);
    writeFileSync(settingsPath, original);
    await inst().install();
    await inst().uninstall();
    expect(readFileSync(settingsPath, 'utf8')).toBe(original);
    expect(existsSync(`${settingsPath}.agent-notifier.bak`)).toBe(false);
  });
});
