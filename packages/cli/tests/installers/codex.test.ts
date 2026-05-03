import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexInstaller } from '../../src/lib/installers/codex.js';

describe('codex installer', () => {
  let home: string;
  let configPath: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'agentcdx-'));
    mkdirSync(join(home, '.codex'));
    configPath = join(home, '.codex', 'config.toml');
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const inst = () => createCodexInstaller({ home });

  it('detect: true when ~/.codex exists', async () => {
    expect(await inst().detect()).toBe(true);
  });

  it('install adds [[hooks.PermissionRequest]] and [[hooks.Stop]] entries', async () => {
    await inst().install();
    const raw = readFileSync(configPath, 'utf8');
    expect(raw).toContain('PermissionRequest');
    expect(raw).toContain('Stop');
    expect(raw).toContain('agent-notifier hook --tool codex');
  });

  it('install backs up existing TOML', async () => {
    writeFileSync(configPath, 'model = "gpt-5"\n');
    await inst().install();
    expect(readFileSync(`${configPath}.agent-notifier.bak`, 'utf8')).toContain('model = "gpt-5"');
  });

  it('install is idempotent', async () => {
    await inst().install();
    const a = readFileSync(configPath, 'utf8');
    await inst().install();
    expect(readFileSync(configPath, 'utf8')).toBe(a);
  });

  it('uninstall restores backup', async () => {
    const original = 'model = "gpt-5"\n';
    writeFileSync(configPath, original);
    await inst().install();
    await inst().uninstall();
    expect(readFileSync(configPath, 'utf8')).toBe(original);
  });
});
