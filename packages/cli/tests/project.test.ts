import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
}));

// Helpers to strip ANSI codes from output for readable assertions.
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// Capture console.log output during fn()
async function captureLog(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  // eslint-disable-next-line no-console
  const orig = console.log;
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    // eslint-disable-next-line no-console
    console.log = orig;
  }
  return lines.join('\n');
}

describe('project subcommand', () => {
  let home: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agent-proj-')));
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['APPDATA'] = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    vi.resetModules();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // runProjectShow
  // -------------------------------------------------------------------------

  describe('runProjectShow --json', () => {
    it('outputs JSON with project, path, and entry fields', async () => {
      const { runProjectShow } = await import('../src/project.js');
      const out = await captureLog(async () => {
        await runProjectShow({ project: '/tmp/my-project', json: true });
      });
      const parsed = JSON.parse(out) as {
        project: string;
        path: string;
        entry: unknown;
      };
      expect(parsed).toHaveProperty('project');
      expect(parsed).toHaveProperty('path', '/tmp/my-project');
      expect(parsed).toHaveProperty('entry');
    });
  });

  describe('runProjectShow (human readable)', () => {
    it('prints project, path, enabled and kinds lines', async () => {
      const { runProjectShow } = await import('../src/project.js');
      const out = strip(
        await captureLog(async () => {
          await runProjectShow({ project: '/tmp/my-project', json: false });
        }),
      );
      expect(out).toContain('project');
      expect(out).toContain('path');
      expect(out).toContain('enabled');
      expect(out).toContain('kinds');
    });

    it('falls back to default text when no entry exists', async () => {
      const { runProjectShow } = await import('../src/project.js');
      const out = strip(
        await captureLog(async () => {
          await runProjectShow({ project: '/nonexistent-path-xyz', json: false });
        }),
      );
      expect(out).toContain('default');
    });
  });

  // -------------------------------------------------------------------------
  // runProjectSet
  // -------------------------------------------------------------------------

  describe('runProjectSet', () => {
    it('writes enabled and kinds to config', async () => {
      const { runProjectSet } = await import('../src/project.js');
      const target = home;
      await runProjectSet({
        enabled: 'true',
        kinds: 'PERMISSION,IDLE',
        project: target,
      });

      const cfgPath = join(home, '.agent-notifier', 'config.json');
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
        projects: Record<string, { enabled: boolean; kinds?: string[] }>;
      };
      // resolveProjectKey on home returns home itself (no .git above it in tmpdir)
      const entry = cfg.projects[target];
      expect(entry).toBeDefined();
      expect(entry?.enabled).toBe(true);
      expect(entry?.kinds).toEqual(['PERMISSION', 'IDLE']);
    });

    it('sets kinds to undefined when kinds=all', async () => {
      const { runProjectSet } = await import('../src/project.js');
      const target = home;
      await runProjectSet({ enabled: 'true', kinds: 'all', project: target });

      const cfgPath = join(home, '.agent-notifier', 'config.json');
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
        projects: Record<string, { enabled: boolean; kinds?: string[] }>;
      };
      expect(cfg.projects[target]?.kinds).toBeUndefined();
    });

    it('throws on invalid kind', async () => {
      const { runProjectSet } = await import('../src/project.js');
      await expect(runProjectSet({ kinds: 'INVALID_KIND', project: home })).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // runProjectClear
  // -------------------------------------------------------------------------

  describe('runProjectClear', () => {
    it('--yes removes the entry without prompting', async () => {
      const { runProjectSet, runProjectClear } = await import('../src/project.js');
      const target = home;
      await runProjectSet({ enabled: 'true', project: target });

      await runProjectClear({ project: target, yes: true });

      const cfgPath = join(home, '.agent-notifier', 'config.json');
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
        projects: Record<string, unknown>;
      };
      expect(cfg.projects[target]).toBeUndefined();
    });

    it('interactive confirm=false leaves entry untouched', async () => {
      const { confirm } = await import('@inquirer/prompts');
      (confirm as Mock).mockResolvedValueOnce(false);

      const { runProjectSet, runProjectClear } = await import('../src/project.js');
      const target = home;
      await runProjectSet({ enabled: 'true', project: target });

      await runProjectClear({ project: target, yes: false });

      const cfgPath = join(home, '.agent-notifier', 'config.json');
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
        projects: Record<string, unknown>;
      };
      // entry should still be present because user said no
      expect(cfg.projects[target]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // runProjectList
  // -------------------------------------------------------------------------

  describe('runProjectList', () => {
    it('--json outputs all configured projects as JSON', async () => {
      const { runProjectSet, runProjectList } = await import('../src/project.js');
      const target = home;
      await runProjectSet({ enabled: 'true', project: target });

      const out = await captureLog(async () => {
        await runProjectList({ json: true });
      });
      const parsed = JSON.parse(out) as Record<string, unknown>;
      expect(parsed[target]).toBeDefined();
    });

    it('prints (no projects configured) when empty', async () => {
      const { runProjectList } = await import('../src/project.js');
      const out = strip(
        await captureLog(async () => {
          await runProjectList({ json: false });
        }),
      );
      expect(out).toContain('no projects configured');
    });

    it('prints each project line with enabled/disabled and kinds', async () => {
      const { runProjectSet, runProjectList } = await import('../src/project.js');
      const target = home;
      await runProjectSet({ enabled: 'true', kinds: 'TURN_DONE', project: target });

      const out = strip(
        await captureLog(async () => {
          await runProjectList({ json: false });
        }),
      );
      expect(out).toContain(target);
      expect(out).toMatch(/enabled/);
      expect(out).toContain('TURN_DONE');
    });
  });

  // -------------------------------------------------------------------------
  // runProjectInteractive
  // -------------------------------------------------------------------------

  describe('runProjectInteractive', () => {
    it('prompts and writes the result to config', async () => {
      const { checkbox, confirm } = await import('@inquirer/prompts');
      (confirm as Mock).mockResolvedValueOnce(true); // enabled
      (checkbox as Mock).mockResolvedValueOnce(['PERMISSION', 'IDLE', 'TURN_DONE']); // all kinds

      const { runProjectInteractive } = await import('../src/project.js');
      await runProjectInteractive(home);

      const cfgPath = join(home, '.agent-notifier', 'config.json');
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
        projects: Record<string, { enabled: boolean; kinds?: string[] }>;
      };
      // home path is used as target; resolveProjectKey returns home itself in tmpdir
      const entry = cfg.projects[home];
      expect(entry).toBeDefined();
      expect(entry?.enabled).toBe(true);
      // all 3 kinds selected → stored as undefined (all kinds)
      expect(entry?.kinds).toBeUndefined();
    });
  });
});
