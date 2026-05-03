import { describe, it, expect } from 'vitest';
import { parseDuration } from '../src/lib/duration.js';

const NOW = new Date('2026-05-04T10:00:00Z');

describe('parseDuration', () => {
  it('parses "30m"', () =>
    expect(parseDuration('30m', NOW).getTime() - NOW.getTime()).toBe(30 * 60_000));
  it('parses "2h"', () =>
    expect(parseDuration('2h', NOW).getTime() - NOW.getTime()).toBe(2 * 60 * 60_000));
  it('parses "1d"', () =>
    expect(parseDuration('1d', NOW).getTime() - NOW.getTime()).toBe(24 * 60 * 60_000));
  it('parses ISO timestamp', () => {
    expect(parseDuration('2026-05-04T15:00:00Z', NOW).toISOString()).toBe(
      '2026-05-04T15:00:00.000Z',
    );
  });
  it('parses "until 17:00" (today)', () => {
    expect(parseDuration('until 17:00', NOW).toISOString()).toBe('2026-05-04T17:00:00.000Z');
  });
  it('parses "until 05:00" as tomorrow when already past', () => {
    expect(parseDuration('until 05:00', NOW).toISOString()).toBe('2026-05-05T05:00:00.000Z');
  });
  it('parses "until tomorrow"', () => {
    expect(parseDuration('until tomorrow', NOW).toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });
  it('throws on garbage', () => expect(() => parseDuration('garbage', NOW)).toThrow());
  it('throws on zero duration', () => expect(() => parseDuration('0m', NOW)).toThrow());
  it('throws on negative duration', () => expect(() => parseDuration('-5m', NOW)).toThrow());
});
