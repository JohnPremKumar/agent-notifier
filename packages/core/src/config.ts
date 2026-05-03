import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
  fsyncSync, openSync, closeSync, copyFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { ConfigSchema, type Config } from './types.js';

export function defaultConfig(tz: string): Config {
  return ConfigSchema.parse({ version: 2, tz });
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function migrate(raw: unknown, file: string): unknown {
  if (!isObject(raw)) return raw;
  if (raw['version'] === 1) {
    const backup = `${file}.v1.bak`;
    if (existsSync(file) && !existsSync(backup)) copyFileSync(file, backup);
    return { ...raw, version: 2 };
  }
  return raw;
}

export function loadConfig(file: string, fallbackTz: string): Config {
  if (!existsSync(file)) return defaultConfig(fallbackTz);
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return ConfigSchema.parse(migrate(raw, file));
}

export function saveConfig(file: string, config: Config): void {
  ConfigSchema.parse(config);
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Re-init backup: timestamped snapshot if config already exists.
  // Distinct from <file>.v1.bak which is one-time pre-migration snapshot.
  // NOTE: backups are not pruned — users with frequent saves should clear *.bak periodically.
  if (existsSync(file)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = randomBytes(2).toString('hex');
    copyFileSync(file, `${file}.${ts}-${suffix}.bak`);
  }

  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  const fd = openSync(tmp, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

export class ConfigStore {
  constructor(
    private readonly file: string,
    private readonly fallbackTz: string,
  ) {}
  load(): Config {
    return loadConfig(this.file, this.fallbackTz);
  }
  save(c: Config): void {
    saveConfig(this.file, c);
  }
  update(mutator: (c: Config) => void): Config {
    const c = this.load();
    mutator(c);
    this.save(c);
    return c;
  }
}
