import { afterEach, describe, expect, it } from 'vitest';
import { sym, formatError, isQuiet, isJson, isDebug } from '../src/lib/ui.js';

describe('UI primitives — symbol set', () => {
  it('exposes the locked symbol set', () => {
    expect(sym.ok).toBe('✓');
    expect(sym.warn).toBe('!');
    expect(sym.fail).toBe('✗');
    expect(sym.dot).toBe('·');
    expect(sym.cursor).toBe('›');
    expect(sym.flow).toBe('▸');
    expect(sym.dash).toBe('—');
    expect(sym.alert).toBe('⚠');
  });
});

describe('UI primitives — formatError', () => {
  it('formats errors as what / why / next, with color codes', () => {
    const out = formatError({
      what: "Couldn't wire claude-code",
      why: 'invalid JSON at line 14',
      next: 'fix the file or run `agent-notifier reset`',
    });
    // Strip ANSI escape sequences for plain-text assertions.
    // eslint-disable-next-line no-control-regex
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain("Couldn't wire claude-code");
    expect(plain).toContain('Why:  invalid JSON at line 14');
    expect(plain).toContain('Next: fix the file or run `agent-notifier reset`');
    expect(plain).toContain('✗');
  });
});

describe('UI primitives — flag detection', () => {
  // process.argv mutation needs save/restore
  const argv = process.argv;
  afterEach(() => {
    process.argv = argv;
  });

  it('isQuiet returns true when --quiet present', () => {
    process.argv = ['node', 'bin', 'status', '--quiet'];
    expect(isQuiet()).toBe(true);
  });

  it('isQuiet returns true when -q present', () => {
    process.argv = ['node', 'bin', 'status', '-q'];
    expect(isQuiet()).toBe(true);
  });

  it('isQuiet returns false when neither flag present', () => {
    process.argv = ['node', 'bin', 'status'];
    expect(isQuiet()).toBe(false);
  });

  it('isJson detects --json', () => {
    process.argv = ['node', 'bin', 'status', '--json'];
    expect(isJson()).toBe(true);
    process.argv = ['node', 'bin', 'status'];
    expect(isJson()).toBe(false);
  });

  it('isDebug detects --debug', () => {
    process.argv = ['node', 'bin', 'status', '--debug'];
    expect(isDebug()).toBe(true);
  });

  it('isDebug honors AGENT_NOTIFIER_DEBUG=1 env var', () => {
    process.argv = ['node', 'bin', 'status'];
    const prev = process.env['AGENT_NOTIFIER_DEBUG'];
    process.env['AGENT_NOTIFIER_DEBUG'] = '1';
    try {
      expect(isDebug()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env['AGENT_NOTIFIER_DEBUG'];
      else process.env['AGENT_NOTIFIER_DEBUG'] = prev;
    }
  });
});

describe('UI primitives — spinner (non-TTY fallback)', () => {
  it('returns a stub that prints with ✓ on succeed when not TTY', async () => {
    const { spinner } = await import('../src/lib/ui.js');
    const origIsTTY = process.stdout.isTTY;
    // eslint-disable-next-line no-console
    const origLog = console.log;
    let captured = '';
    // eslint-disable-next-line no-console
    console.log = (msg: string) => {
      captured += msg + '\n';
    };
    // Cast needed because isTTY is readonly in the type but assignable at runtime
    // for testing non-TTY code paths without spawning a subprocess.
    (process.stdout as { isTTY: boolean | undefined }).isTTY = false;
    try {
      const sp = spinner('Loading...');
      sp.start();
      sp.succeed('Loaded');
      // strip ANSI escape sequences from captured output.
      // eslint-disable-next-line no-control-regex
      const plain = captured.replace(/\x1b\[[0-9;]*m/g, '');
      expect(plain).toContain('✓');
      expect(plain).toContain('Loaded');
    } finally {
      (process.stdout as { isTTY: boolean | undefined }).isTTY = origIsTTY;
      // eslint-disable-next-line no-console
      console.log = origLog;
    }
  });
});
