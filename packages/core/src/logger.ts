import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

export interface LogEntry {
  ts: string;
  tool: string;
  kind: string;
  project: string;
  sessionId: string;
  fired: boolean;
  suppressReason?: string;
  msg?: string;
  error?: string;
}

export interface LoggerOptions {
  dir: string;
  maxBytes: number;
  generations: number;
}

export class Logger {
  private readonly file: string;
  constructor(private readonly opts: LoggerOptions) {
    if (!existsSync(opts.dir)) mkdirSync(opts.dir, { recursive: true });
    this.file = join(opts.dir, 'notifier.log');
  }

  append(entry: LogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    this.rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
    appendFileSync(this.file, line, 'utf8');
  }

  private rotateIfNeeded(incomingBytes: number): void {
    let currentSize = 0;
    try {
      currentSize = statSync(this.file).size;
    } catch {
      return;
    }
    if (currentSize + incomingBytes <= this.opts.maxBytes) return;

    for (let i = this.opts.generations - 1; i >= 1; i--) {
      const src = i === 1 ? this.file : `${this.file}.${i - 1}`;
      const dst = `${this.file}.${i}`;
      if (!existsSync(src)) continue;
      if (i === this.opts.generations - 1 && existsSync(dst)) unlinkSync(dst);
      if (existsSync(dst)) unlinkSync(dst);
      renameSync(src, dst);
    }
  }

  readAll(): LogEntry[] {
    if (!existsSync(this.file)) return [];
    const raw = readFileSync(this.file, 'utf8');
    const out: LogEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as LogEntry);
      } catch {
        /* skip malformed */
      }
    }
    return out;
  }

  readTail(n: number): LogEntry[] {
    const all = this.readAll();
    return all.slice(Math.max(0, all.length - n));
  }
}
