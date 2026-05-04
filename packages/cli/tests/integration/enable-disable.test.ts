import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

describe('enable / disable', () => {
  let home: string;
  let projectDir: string;
  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentena-')));
    projectDir = join(home, 'project-x');
    mkdirSync(join(projectDir, '.git'), { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });
  const cfg = () =>
    JSON.parse(readFileSync(join(home, '.agent-notifier', 'config.json'), 'utf8')) as Record<
      string,
      unknown
    >;

  it('disable --global writes global.enabled = false to config', () => {
    execFileSync('node', [BIN, 'disable', '--global'], { env: env() });
    expect((cfg().global as Record<string, unknown>).enabled).toBe(false);
  });

  it('enable --global re-enables', () => {
    execFileSync('node', [BIN, 'disable', '--global'], { env: env() });
    execFileSync('node', [BIN, 'enable', '--global'], { env: env() });
    expect((cfg().global as Record<string, unknown>).enabled).toBe(true);
  });

  it('disable --tool codex marks codex disabled', () => {
    execFileSync('node', [BIN, 'disable', '--tool', 'codex'], { env: env() });
    expect(
      ((cfg().tools as Record<string, unknown>).codex as Record<string, unknown>).enabled,
    ).toBe(false);
  });

  it('disable --project <path> records the project key (git root) as disabled', () => {
    execFileSync('node', [BIN, 'disable', '--project', projectDir], { env: env() });
    expect((cfg().projects as Record<string, unknown>)[projectDir]).toEqual({ enabled: false });
  });

  it('disable with no flags defaults to current directory project key', () => {
    execFileSync('node', [BIN, 'disable'], { env: env(), cwd: projectDir });
    expect((cfg().projects as Record<string, unknown>)[projectDir]).toEqual({ enabled: false });
  });

  it('rejects unknown tool name', () => {
    expect(() =>
      execFileSync('node', [BIN, 'disable', '--tool', 'aider'], { env: env() }),
    ).toThrow();
  });
});
