import { describe, it, expect } from 'vitest';
import { adapters } from '../../src/adapters/index.js';

describe('adapter registry', () => {
  it('contains all four adapters keyed by tool name', () => {
    expect(Object.keys(adapters).sort()).toEqual(['claude-code', 'codex', 'gemini', 'opencode']);
  });

  it('every adapter is a function', () => {
    for (const fn of Object.values(adapters)) expect(typeof fn).toBe('function');
  });
});
