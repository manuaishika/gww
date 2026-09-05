/**
 * The engine layer: the impure boundary around the pure detectors.
 * Reads bars from the DB, runs `detectSymbol` per session, applies cooldown
 * against already-stored events, writes `stats_daily` and `events`.
 *
 * Detectors never see this file; this file is the only place detection touches
 * the database or the clock.
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  barsDaily,
  events as eventsTable,
  newsEvents as newsEventsTable,
  quotesLatest,
  statsDaily,
  symbols,
} from "./db/schema";
import {
  CONFIG,
  computeStats,
  detectSymbol,
  suppressedByCooldown,
  type Bar,
  type CircuitState,
  type NewsItem,
  type SessionEvent,
} from "./detectors";
import { NIFTY_SYMBOL } from "./seed-data";

const num = (v: string | null): number => (v == null ? NaN : Number(v));

function rowsToBars(
  rows: { sessionDate: string; open: string | null; high: string | null; low: string | null; close: string | null; adjClose: string | null; volume: string | null }[],
): Bar[] {
  return rows.map((r) => ({
    sessionDate: r.sessionDate,
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    close: num(r.close),
    adjClose: num(r.adjClose),
    volume: num(r.volume),
  }));
}

export async function loadBars(symbol: string): Promise<Bar[]> {
  const rows = await db
    .select()
    .from(barsDaily)
    .where(eq(barsDaily.symbol, symbol))
    .orderBy(asc(barsDaily.sessionDate));
  return rowsToBars(rows);
}

export async function loadNewsEvents(symbol: string): Promise<NewsItem[]> {
  const rows = await db
    .select({ eventDate: newsEventsTable.eventDate, kind: newsEventsTable.kind })
    .from(newsEventsTable)
    .where(eq(newsEventsTable.symbol, symbol))
    .orderBy(asc(newsEventsTable.eventDate));
  return rows.map((r) => ({ eventDate: r.eventDate, kind: r.kind as NewsItem["kind"] }));
}

export async function circuitStateOf(symbol: string): Promise<CircuitState> {
  const [q] = await db
    .select({ circuitState: quotesLatest.circuitState })
    .from(quotesLatest)
    .where(eq(quotesLatest.symbol, symbol));
  return (q?.circuitState as CircuitState) ?? "none";
}

/** Compute and upsert stats_daily for one symbol, as of its latest bar. */
export async function refreshStats(symbol: string, indexBars: Bar[]): Promise<void> {
  const bars = await loadBars(symbol);
  const stats = computeStats(bars, indexBars);
  await db
    .insert(statsDaily)
    .values({
      symbol,
      sigma60: stats.sigma60?.toString() ?? null,
      beta60: stats.beta60?.toString() ?? null,
      residSigma60: stats.residSigma60?.toString() ?? null,
      volMedian30: stats.volMedian30?.toString() ?? null,
      volMad30: stats.volMad30?.toString() ?? null,
      high252: stats.high252?.toString() ?? null,
      low252: stats.low252?.toString() ?? null,
      sessionsAvailable: stats.sessionsAvailable,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: statsDaily.symbol,
      set: {
        sigma60: sql`excluded.sigma_60`,
        beta60: sql`excluded.beta_60`,
        residSigma60: sql`excluded.resid_sigma_60`,
        volMedian30: sql`excluded.vol_median_30`,
        volMad30: sql`excluded.vol_mad_30`,
        high252: sql`excluded.high_252`,
        low252: sql`excluded.low_252`,
        sessionsAvailable: sql`excluded.sessions_available`,
        computedAt: sql`excluded.computed_at`,
      },
    });
}

export async function refreshAllStats(): Promise<number> {
  const indexBars = await loadBars(NIFTY_SYMBOL);
  const all = await db
    .select({ symbol: symbols.symbol })
    .from(symbols)
    .where(eq(symbols.isActive, true));
  let n = 0;
  for (const { symbol } of all) {
    if (symbol === NIFTY_SYMBOL) continue;
    await refreshStats(symbol, indexBars);
    n++;
  }
  return n;
}

/**
 * Run detection for one symbol over its most recent `lookback` sessions.
 * `stats` is held fixed at "as of latest" — good enough for a backfill; the
 * live cron recomputes stats each session.
 */
export async function detectForSymbol(
  symbol: string,
  indexBars: Bar[],
  lookback: number,
): Promise<number> {
  const bars = await loadBars(symbol);
  if (bars.length < CONFIG.history.minSessionsForStats + 1) return 0;

  const stats = computeStats(bars, indexBars);
  const circuitState = await circuitStateOf(symbol);
  const allNews = await loadNewsEvents(symbol);

  const firstIdx = Math.max(1, bars.length - lookback);
  const candidates: SessionEvent[] = [];
  for (let i = firstIdx; i < bars.length; i++) {
    const slice = bars.slice(0, i + 1);
    const sessionDate = bars[i].sessionDate;
    const event = detectSymbol({
      symbol,
      sessionDate,
      bars: slice,
      indexBars,
      stats,
      horizonSessions: 1,
      circuitState,
      newsEvents: allNews.filter((n) => n.eventDate <= sessionDate),
    });
    if (event) candidates.push(event);
  }
  if (candidates.length === 0) return 0;

  // cooldown: drop a candidate if this symbol already fired within the last
  // `cooldown.sessions` sessions and |z| did not grow enough. Candidates are
  // walked in session order and each KEPT one feeds the cooldown window for
  // the next — checking only against DB rows from a previous run would miss
  // same-batch repeats entirely on a first-ever backfill (every row is new,
  // so "prior" would be empty and nothing would ever cool down).
  const earliest = candidates[0].sessionDate; // candidates is already ascending
  const priorFromDb = await db
    .select({ sessionDate: eventsTable.sessionDate, z: eventsTable.z })
    .from(eventsTable)
    .where(and(eq(eventsTable.symbol, symbol), gte(eventsTable.sessionDate, earliest)))
    .orderBy(desc(eventsTable.sessionDate));

  const sessions = bars.map((b) => b.sessionDate);
  const sessionIdx = new Map(sessions.map((d, i) => [d, i]));
  const recent: { sessionDate: string; z: number }[] = priorFromDb.map((p) => ({
    sessionDate: p.sessionDate,
    z: num(p.z),
  }));

  const kept: SessionEvent[] = [];
  for (const c of candidates) {
    const ci = sessionIdx.get(c.sessionDate) ?? 0;
    let priorZ: number | null = null;
    for (const p of recent) {
      const pi = sessionIdx.get(p.sessionDate);
      if (pi == null || pi >= ci) continue;
      if (ci - pi <= CONFIG.cooldown.sessions) {
        priorZ = Math.max(priorZ ?? 0, Math.abs(p.z));
      }
    }
    if (suppressedByCooldown(c.z, priorZ)) continue;
    kept.push(c);
    recent.push({ sessionDate: c.sessionDate, z: c.z }); // feeds later iterations
  }
  if (kept.length === 0) return 0;

  const res = await db
    .insert(eventsTable)
    .values(
      kept.map((e) => ({
        symbol: e.symbol,
        detector: e.detector,
        sessionDate: e.sessionDate,
        dedupeKey: e.dedupeKey,
        score: e.score.toString(),
        z: e.z.toString(),
        payload: e.signals,
        detectedAt: new Date(),
      })),
    )
    .onConflictDoNothing({ target: eventsTable.dedupeKey })
    .returning({ id: eventsTable.id });
  return res.length;
}

export async function detectAll(lookback = 45): Promise<{ symbols: number; events: number }> {
  const indexBars = await loadBars(NIFTY_SYMBOL);
  const active = await db
    .select({ symbol: symbols.symbol })
    .from(symbols)
    .where(eq(symbols.isActive, true));

  let events = 0;
  let count = 0;
  for (const { symbol } of active) {
    if (symbol === NIFTY_SYMBOL) continue;
    events += await detectForSymbol(symbol, indexBars, lookback);
    count++;
  }
  return { symbols: count, events };
}
