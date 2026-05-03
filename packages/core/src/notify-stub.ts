import { existsSync, mkdirSync, statSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Event } from './types.js';

const STUB_FILE = 'stub-notifications.jsonl';
const CAP_BYTES = 256 * 1024;

/**
 * Append a single event to the stub-notifications log used in test/doctor/init paths
 * when AGENT_NOTIFIER_NOTIFY_IMPL=stub. Truncates the log when the size cap is exceeded
 * to prevent unbounded growth in long-running stub sessions.
 */
export function stubNotifyAppend(dir: string, event: Event): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, STUB_FILE);
  const line = JSON.stringify({ event }) + '\n';
  if (existsSync(file) && statSync(file).size + line.length > CAP_BYTES) {
    // truncate + write fresh: stub log is debug-only, no rotation history needed
    writeFileSync(file, line, 'utf8');
    return;
  }
  appendFileSync(file, line, 'utf8');
}
