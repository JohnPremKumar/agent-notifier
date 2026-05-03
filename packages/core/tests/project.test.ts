// packages/core/tests/project.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProjectKey, projectDisplayName } from '../src/project.js';

describe('project', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agentproj-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns git-root when .git directory is found by walking up', () => {
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'a', 'b', 'c'), { recursive: true });
    expect(resolveProjectKey(join(root, 'a', 'b', 'c'))).toBe(root);
  });

  it('returns git-root when .git is at the cwd itself', () => {
    mkdirSync(join(root, '.git'));
    expect(resolveProjectKey(root)).toBe(root);
  });

  it('falls back to cwd when no .git is found', () => {
    mkdirSync(join(root, 'sub'));
    expect(resolveProjectKey(join(root, 'sub'))).toBe(join(root, 'sub'));
  });

  it('projectDisplayName returns the basename of the project key', () => {
    expect(projectDisplayName('/Users/x/Desktop/my-app')).toBe('my-app');
  });

  it('resolveProjectKey caches results within a process', () => {
    mkdirSync(join(root, '.git'));
    const a = resolveProjectKey(root);
    const b = resolveProjectKey(root);
    expect(a).toBe(b);
  });
});
