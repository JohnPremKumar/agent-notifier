import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const cache = new Map<string, string>();

export function resolveProjectKey(cwd: string): string {
  const start = resolve(cwd);
  const cached = cache.get(start);
  if (cached) return cached;

  let dir = start;
  let parent = dirname(dir);
  while (dir !== parent) {
    const gitDir = join(dir, '.git');
    if (existsSync(gitDir)) {
      try {
        statSync(gitDir); // exists and stat-able (file or dir)
        cache.set(start, dir);
        return dir;
      } catch {
        /* fall through */
      }
    }
    dir = parent;
    parent = dirname(dir);
  }
  // check filesystem root itself
  const gitDir = join(dir, '.git');
  if (existsSync(gitDir)) {
    try {
      statSync(gitDir);
      cache.set(start, dir);
      return dir;
    } catch {
      /* fall through */
    }
  }
  cache.set(start, start);
  return start;
}

export function projectDisplayName(projectKey: string): string {
  return basename(projectKey);
}

export function clearProjectCache(): void {
  cache.clear();
}
