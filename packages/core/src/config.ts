import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  fsyncSync,
  openSync,
  closeSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { ConfigSchema, type Config } from './types.js';

export function defaultConfig(tz: string): Config {
  return ConfigSchema.parse({ version: 1, tz });
}

export function loadConfig(file: string, fallbackTz: string): Config {
  if (!existsSync(file)) return defaultConfig(fallbackTz);
  const raw = readFileSync(file, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  return ConfigSchema.parse(parsed);
}

export function saveConfig(file: string, config: Config): void {
  ConfigSchema.parse(config); // throws on invalid
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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
