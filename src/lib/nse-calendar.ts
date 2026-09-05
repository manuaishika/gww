/**
 * The NSE trading calendar.
 *
 * We never compute a change "across a session boundary that doesn't exist" by
 * assuming `weekday != Sunday`. NSE has ~14 trading holidays a year, plus the
 * occasional special session. The calendar is the observed set of ^NSEI
 * sessions, committed in `seed/nse-calendar.json` and refreshed by the ingest
 * path.
 */
import calendar from "./seed/nse-calendar.json";

const SESSIONS: string[] = [...calendar.sessions].sort();
const SESSION_SET = new Set(SESSIONS);

export const firstSession = SESSIONS[0];
export const lastSession = SESSIONS[SESSIONS.length - 1];
export const allSessions = (): readonly string[] => SESSIONS;

const toIso = (d: string | Date): string =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

export function isSession(date: string | Date): boolean {
  return SESSION_SET.has(toIso(date));
}

/**
 * Number of trading sessions in (from, to] — i.e. how many times the market
 * has closed since `from`. Clamped to the known calendar; returns 0 if `to`
 * is not after `from`.
 */
export function sessionsBetween(from: string | Date, to: string | Date): number {
  const a = toIso(from);
  const b = toIso(to);
  if (b <= a) return 0;
  let n = 0;
  for (const s of SESSIONS) {
    if (s > a && s <= b) n++;
  }
  return n;
}

/** The most recent session on or before `date` (the "as of" session). */
export function sessionOnOrBefore(date: string | Date): string | null {
  const d = toIso(date);
  for (let i = SESSIONS.length - 1; i >= 0; i--) {
    if (SESSIONS[i] <= d) return SESSIONS[i];
  }
  return null;
}
