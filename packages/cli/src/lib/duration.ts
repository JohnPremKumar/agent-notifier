const REL_RE = /^(\d+)\s*(s|m|h|d)$/;
const HHMM_RE = /^until\s+(\d{1,2}):(\d{2})$/;

export function parseDuration(input: string, now: Date = new Date()): Date {
  const trimmed = input.trim().toLowerCase();

  const rel = trimmed.match(REL_RE);
  if (rel) {
    const n = Number(rel[1]);
    if (n <= 0) throw new Error(`Duration must be positive: ${input}`);
    const unit = rel[2]!;
    const ms = n * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 0);
    return new Date(now.getTime() + ms);
  }

  if (trimmed === 'until tomorrow') {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  const hhmm = trimmed.match(HHMM_RE);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (h > 23 || m > 59) throw new Error(`Invalid time: ${input}`);
    const target = new Date(now);
    target.setUTCHours(h, m, 0, 0);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
    return target;
  }

  // Fallback: ISO 8601
  const iso = new Date(input);
  if (!Number.isNaN(iso.getTime()) && iso.getTime() > now.getTime()) return iso;

  throw new Error(
    `Cannot parse duration: ${input}. Try "30m", "2h", "until 17:00", "until tomorrow", or an ISO timestamp.`,
  );
}
