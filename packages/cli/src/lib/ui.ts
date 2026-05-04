import kleur from 'kleur';
import ora, { type Ora } from 'ora';

// Locked symbol set. These are the brand vocabulary — every command should
// pull from here rather than inlining glyphs. Changing one of these touches
// all CLI output at once, so tweaks need a deliberate review.
export const sym = {
  ok: '✓',
  fail: '✗',
  warn: '!',
  dot: '·',
  cursor: '›',
  flow: '▸',
  alert: '⚠',
  dash: '—',
} as const;

export function colorOk(s: string): string {
  return kleur.green(s);
}
export function colorWarn(s: string): string {
  return kleur.yellow(s);
}
export function colorFail(s: string): string {
  return kleur.red(s);
}
export function colorDim(s: string): string {
  return kleur.gray(s);
}

export interface ErrorMsg {
  what: string;
  why: string;
  next: string;
}

// Standard error shape: ✗ what / Why / Next. Used by every command's
// catch handler so users see the same scannable structure on failure.
export function formatError(e: ErrorMsg): string {
  return [
    `${colorFail(sym.fail)} ${kleur.bold(e.what)}`,
    '',
    `  Why:  ${e.why}`,
    `  Next: ${e.next}`,
  ].join('\n');
}

// Universal flag detection. Reads process.argv directly (rather than commander
// state) so helpers can be called from any depth without threading state.
export function isQuiet(): boolean {
  return process.argv.includes('--quiet') || process.argv.includes('-q');
}
export function isJson(): boolean {
  return process.argv.includes('--json');
}
export function isDebug(): boolean {
  return process.argv.includes('--debug') || process.env['AGENT_NOTIFIER_DEBUG'] === '1';
}

// Spinner contract: callers always get start/succeed/fail/stop. In a TTY
// (interactive) you get the real ora animation; otherwise you get a stub
// that prints ✓/✗ lines so CI logs and piped output stay readable.
// Quiet mode prints nothing on succeed; JSON mode prints nothing on either
// (the command will write its own structured output instead).
export interface SpinnerHandle {
  start: () => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
  stop: () => void;
}

export function spinner(text: string): SpinnerHandle | Ora {
  if (!process.stdout.isTTY || isQuiet() || isJson()) {
    return {
      start: (): void => undefined,
      succeed: (t?: string): void => {
        if (!isQuiet() && !isJson()) console.log(`${colorOk(sym.ok)} ${t ?? text}`);
      },
      fail: (t?: string): void => {
        if (!isJson()) console.error(`${colorFail(sym.fail)} ${t ?? text}`);
      },
      stop: (): void => undefined,
    };
  }
  return ora({ text, spinner: 'dots' });
}
