/**
 * Staleness classification. Never render a bare number — every
 * quote carries `source`, `exchange_ts`, `fetched_at`; this turns those three
 * fields into one of four honest states. Pure, runs client-side so the badge
 * stays accurate as time passes without a refetch.
 */
import { isSession, lastSession } from "./nse-calendar";

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const MARKET_OPEN_MIN = 9 * 60 + 15; // 09:15 IST
const MARKET_CLOSE_MIN = 15 * 60 + 30; // 15:30 IST
const LIVE_LAG_MIN = 2;
const STALE_AFTER_SESSIONS = 2;

export type QuoteLike = {
  price: string | number | null;
  exchangeTs: string | null;
  fetchedAt: string | null;
  source: string | null;
  isDisputed?: boolean | null;
};

export type Staleness =
  | { kind: "live" }
  | { kind: "delayed"; minutes: number }
  | { kind: "at_close"; date: string }
  | { kind: "stale"; ageLabel: string }
  | { kind: "no_data" };

function istParts(d: Date) {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    dateStr: ist.toISOString().slice(0, 10),
    minutesOfDay: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

export function isMarketOpen(now: Date = new Date()): boolean {
  const { dateStr, minutesOfDay } = istParts(now);
  if (!isSession(dateStr)) return false;
  return minutesOfDay >= MARKET_OPEN_MIN && minutesOfDay <= MARKET_CLOSE_MIN;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function ageLabel(fromMs: number, nowMs: number): string {
  const days = Math.floor((nowMs - fromMs) / 86_400_000);
  if (days <= 0) {
    const hours = Math.max(1, Math.round((nowMs - fromMs) / 3_600_000));
    return `${hours}h`;
  }
  return `${days}d`;
}

export function classifyQuote(
  quote: QuoteLike | null | undefined,
  now: Date = new Date(),
): Staleness {
  if (!quote || quote.price == null) return { kind: "no_data" };

  const nowMs = now.getTime();
  let exchangeTs = quote.exchangeTs ? Date.parse(quote.exchangeTs) : null;
  const fetchedAt = quote.fetchedAt ? Date.parse(quote.fetchedAt) : null;

  // clock skew guard: never trust an exchange_ts in the future
  if (exchangeTs != null && exchangeTs > nowMs) exchangeTs = null;

  const open = isMarketOpen(now);

  if (open && exchangeTs != null) {
    const lagMin = (nowMs - exchangeTs) / 60_000;
    if (lagMin <= LIVE_LAG_MIN) return { kind: "live" };
    return { kind: "delayed", minutes: Math.round(lagMin) };
  }

  if (exchangeTs != null) {
    const sessionOfQuote = new Date(exchangeTs).toISOString().slice(0, 10);
    if (sessionOfQuote >= lastSession) return { kind: "at_close", date: fmtDate(sessionOfQuote) };
    return { kind: "stale", ageLabel: ageLabel(exchangeTs, nowMs) };
  }

  if (fetchedAt != null) return { kind: "stale", ageLabel: ageLabel(fetchedAt, nowMs) };

  return { kind: "no_data" };
}

export function stalenessLabel(s: Staleness): string {
  switch (s.kind) {
    case "live":
      return "live";
    case "delayed":
      return `delayed ${s.minutes}m`;
    case "at_close":
      return `as of close, ${s.date}`;
    case "stale":
      return `stale · ${s.ageLabel} old`;
    case "no_data":
      return "no data";
  }
}
