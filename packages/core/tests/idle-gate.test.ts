// packages/core/tests/idle-gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parseIoregOutput, parsePowerShellOutput, getIdleSeconds } from '../src/idle-gate.js';

// ESM: __dirname is not available in "type":"module" packages, so we derive it.
const __dirname = dirname(fileURLToPath(import.meta.url));

describe('idle-gate parsers', () => {
  it('parseIoregOutput extracts seconds from a real ioreg snippet', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'ioreg-idle-12s.txt'), 'utf8');
    expect(parseIoregOutput(raw)).toBe(12);
  });

  it('parsePowerShellOutput parses the integer second count', () => {
    const raw = readFileSync(join(__dirname, 'fixtures', 'powershell-idle-3s.txt'), 'utf8');
    expect(parsePowerShellOutput(raw)).toBe(3);
  });

  it('parseIoregOutput throws on output missing HIDIdleTime', () => {
    expect(() => parseIoregOutput('garbage')).toThrow();
  });

  it('parsePowerShellOutput throws on non-numeric output', () => {
    expect(() => parsePowerShellOutput('not a number')).toThrow();
  });
});

describe('getIdleSeconds (with stubbed exec)', () => {
  it('fail-open: returns Infinity if probe throws', async () => {
    const stub = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await getIdleSeconds({ exec: stub, platform: 'darwin', timeoutMs: 200 });
    expect(result).toBe(Infinity);
  });

  it('darwin: invokes ioreg and parses result', async () => {
    const stub = vi.fn().mockResolvedValue({ stdout: '"HIDIdleTime" = 5000000000', stderr: '' });
    const result = await getIdleSeconds({ exec: stub, platform: 'darwin', timeoutMs: 200 });
    expect(result).toBe(5);
    expect(stub.mock.calls[0]?.[0]).toContain('ioreg');
  });

  it('win32: invokes powershell and parses result', async () => {
    const stub = vi.fn().mockResolvedValue({ stdout: '7\r\n', stderr: '' });
    const result = await getIdleSeconds({ exec: stub, platform: 'win32', timeoutMs: 200 });
    expect(result).toBe(7);
    expect(stub.mock.calls[0]?.[0]).toContain('powershell');
  });
});
