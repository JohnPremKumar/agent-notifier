import { applyToggle, type EnableOpts } from './enable.js';

export async function runDisable(opts: EnableOpts): Promise<void> { await applyToggle(opts, false); }
