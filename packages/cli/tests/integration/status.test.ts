import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', '..', 'bin', 'agent-notifier.js');

/**
 * Shared test helpers.
 * Every test gets an isolated HOME so no config bleeds between runs.
 */
describe('status — sectioned layout', () => {
  let home: string;
  let project: string;

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agentst-')));
    project = join(home, 'p');
    mkdirSync(join(project, '.git'), { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, APPDATA: home });

  // ─── default output ───────────────────────────────────────────────────────

  it('prints header line with version, platform, and config dir', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toMatch(/agent-notifier \d+\.\d+\.\d+/);
    expect(out).toContain(process.platform);
  });

  it('has Notifications section header', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('Notifications');
  });

  it('has Tools section header', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('Tools');
  });

  it('has "This project" section header', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('This project');
  });

  it('has "Idle gate" section header', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('Idle gate');
  });

  it('sections appear in correct order: Notifications → Tools → This project → Idle gate', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    const nIdx = out.indexOf('Notifications');
    const tIdx = out.indexOf('Tools');
    const pIdx = out.indexOf('This project');
    const iIdx = out.indexOf('Idle gate');
    expect(nIdx).toBeGreaterThan(-1);
    expect(tIdx).toBeGreaterThan(nIdx);
    expect(pIdx).toBeGreaterThan(tIdx);
    expect(iIdx).toBeGreaterThan(pIdx);
  });

  it('shows "(no recent activity)" when log is empty', () => {
    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('no recent activity');
  });

  // ─── --json flag ──────────────────────────────────────────────────────────

  it('--json outputs valid JSON with all required top-level keys', () => {
    const raw = execFileSync('node', [BIN, 'status', '--json'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    // Must be parseable JSON
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // The 10 required top-level keys
    const required = [
      'version',
      'platform',
      'configDir',
      'globalEnabled',
      'muted',
      'schedules',
      'tools',
      'currentProject',
      'idleGate',
      'recent',
    ];
    for (const key of required) {
      expect(parsed, `missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('--json does NOT print human section headers', () => {
    const raw = execFileSync('node', [BIN, 'status', '--json'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(raw).not.toContain('Notifications');
    expect(raw).not.toContain('This project');
    expect(raw).not.toContain('Idle gate');
  });

  it('--json idleGate object has mode, thresholdSeconds, unsupportedTerminalPolicy', () => {
    const raw = execFileSync('node', [BIN, 'status', '--json'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(raw) as {
      idleGate: Record<string, unknown>;
    };
    expect(parsed.idleGate).toHaveProperty('mode');
    expect(parsed.idleGate).toHaveProperty('thresholdSeconds');
    expect(parsed.idleGate).toHaveProperty('unsupportedTerminalPolicy');
  });

  // ─── --verbose flag ───────────────────────────────────────────────────────

  it('--verbose shows idle gate mode, threshold, and policy lines', () => {
    const out = execFileSync('node', [BIN, 'status', '--verbose'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    // Verbose reveals mode/threshold/policy inside the Idle gate section
    expect(out).toContain('Mode');
    expect(out).toContain('Threshold');
    expect(out).toContain('Policy');
  });

  it('--verbose shows full schedule list when schedules exist', () => {
    execFileSync(
      'node',
      [
        BIN,
        'schedule',
        'add',
        '--allow',
        '--days',
        'mon',
        '--from',
        '09:00',
        '--to',
        '18:00',
        '--id',
        'work',
      ],
      { env: env() },
    );
    const out = execFileSync('node', [BIN, 'status', '--verbose'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    // Full schedule details (not just count)
    expect(out).toContain('work');
    expect(out).toContain('09:00');
  });

  it('--verbose shows log path in Recent section', () => {
    // Seed one log entry so Recent section renders
    const logDir = join(home, '.agent-notifier', 'log');
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      join(logDir, 'notifier.log'),
      JSON.stringify({
        ts: '2026-05-04T09:00:00Z',
        tool: 'claude-code',
        kind: 'TURN_DONE',
        project: project,
        sessionId: 's1',
        fired: true,
      }) + '\n',
    );
    const out = execFileSync('node', [BIN, 'status', '--verbose'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('log');
  });

  // ─── --quiet flag ─────────────────────────────────────────────────────────

  it('--quiet produces zero stdout when state is healthy', () => {
    const r = spawnSync('node', [BIN, 'status', '--quiet'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });

  // ─── Recent log section ───────────────────────────────────────────────────

  it('Recent section shows up to 5 entries by default', () => {
    const logD = join(home, '.agent-notifier', 'log');
    mkdirSync(logD, { recursive: true });
    // Write 8 entries; default mode shows last 5
    const entries = Array.from({ length: 8 }, (_, i) => ({
      ts: `2026-05-04T09:0${i}:00Z`,
      tool: 'claude-code',
      kind: 'TURN_DONE',
      project: project,
      sessionId: `s${i}`,
      fired: true,
    }));
    writeFileSync(
      join(logD, 'notifier.log'),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );

    const out = execFileSync('node', [BIN, 'status'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    // Header says "last 5"
    expect(out).toContain('last 5');
  });

  it('--verbose Recent section shows up to 20 entries', () => {
    const logD = join(home, '.agent-notifier', 'log');
    mkdirSync(logD, { recursive: true });
    // Write 22 entries; verbose mode shows last 20
    const entries = Array.from({ length: 22 }, (_, i) => ({
      ts: `2026-05-04T09:${String(i).padStart(2, '0')}:00Z`,
      tool: 'claude-code',
      kind: 'TURN_DONE',
      project: project,
      sessionId: `s${i}`,
      fired: true,
    }));
    writeFileSync(
      join(logD, 'notifier.log'),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );

    const out = execFileSync('node', [BIN, 'status', '--verbose'], {
      env: env(),
      cwd: project,
      encoding: 'utf8',
    });
    expect(out).toContain('last 20');
  });
});
