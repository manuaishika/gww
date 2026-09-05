/**
 * Everything about one symbol, for the detail view you get by clicking a name:
 * the quote (with provenance), the computed stats, every recent event, the
 * price series, and — if you're the one asking — your own watchlist state for it.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  barsDaily,
  events as eventsTable,
  quotesLatest,
  statsDaily,
  symbols,
  userSymbolState,
  watchlistItems,
} from "./db/schema";

const num = (v: string | null): number | null => (v == null ? null : Number(v));

export type SymbolDetail = {
  symbol: string;
  name: string;
  sector: string | null;
  exchange: string;
  currency: string;
  benchmarkSymbol: string;
  isActive: boolean;
  quote: {
    price: number | null;
    prevClose: number | null;
    source: string | null;
    exchangeTs: string | null;
    fetchedAt: string | null;
    circuitState: string | null;
    isDisputed: boolean | null;
    disputeNote: string | null;
  } | null;
  stats: {
    sigma60: number | null;
    beta60: number | null;
    residSigma60: number | null;
    high252: number | null;
    low252: number | null;
    sessionsAvailable: number | null;
  } | null;
  events: {
    id: string;
    detector: string;
    sessionDate: string;
    z: number;
    score: number;
    payload: Record<string, unknown>;
  }[];
  chart: { date: string; close: number }[];
  watchlist: {
    onWatchlist: boolean;
    thesis: string | null;
    positionSize: number | null;
    lastSeenAt: string | null;
  };
};

const CHART_SESSIONS = 90;

export async function getSymbolDetail(
  symbol: string,
  userId: string,
): Promise<SymbolDetail | null> {
  const [meta] = await db
    .select()
    .from(symbols)
    .where(eq(symbols.symbol, symbol));
  if (!meta) return null;

  const [q, s, evs, bars, [wl], [seen]] = await Promise.all([
    db.select().from(quotesLatest).where(eq(quotesLatest.symbol, symbol)),
    db.select().from(statsDaily).where(eq(statsDaily.symbol, symbol)),
    db
      .select({
        id: eventsTable.id,
        detector: eventsTable.detector,
        sessionDate: eventsTable.sessionDate,
        z: eventsTable.z,
        score: eventsTable.score,
        payload: eventsTable.payload,
      })
      .from(eventsTable)
      .where(eq(eventsTable.symbol, symbol))
      .orderBy(desc(eventsTable.sessionDate))
      .limit(12),
    db
      .select({ sessionDate: barsDaily.sessionDate, adjClose: barsDaily.adjClose })
      .from(barsDaily)
      .where(eq(barsDaily.symbol, symbol))
      .orderBy(desc(barsDaily.sessionDate))
      .limit(CHART_SESSIONS),
    db
      .select({
        thesis: watchlistItems.thesis,
        positionSize: watchlistItems.positionSize,
      })
      .from(watchlistItems)
      .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol))),
    db
      .select({ lastSeenAt: userSymbolState.lastSeenAt })
      .from(userSymbolState)
      .where(and(eq(userSymbolState.userId, userId), eq(userSymbolState.symbol, symbol))),
  ]);

  const quote = q[0]
    ? {
        price: num(q[0].price),
        prevClose: num(q[0].prevClose),
        source: q[0].source,
        exchangeTs: q[0].exchangeTs?.toISOString() ?? null,
        fetchedAt: q[0].fetchedAt?.toISOString() ?? null,
        circuitState: q[0].circuitState,
        isDisputed: q[0].isDisputed,
        disputeNote: q[0].disputeNote,
      }
    : null;

  const stats = s[0]
    ? {
        sigma60: num(s[0].sigma60),
        beta60: num(s[0].beta60),
        residSigma60: num(s[0].residSigma60),
        high252: num(s[0].high252),
        low252: num(s[0].low252),
        sessionsAvailable: s[0].sessionsAvailable,
      }
    : null;

  return {
    symbol: meta.symbol,
    name: meta.name,
    sector: meta.sector,
    exchange: meta.exchange,
    currency: meta.currency,
    benchmarkSymbol: meta.benchmarkSymbol,
    isActive: meta.isActive,
    quote,
    stats,
    events: evs.map((e) => ({
      id: e.id,
      detector: e.detector,
      sessionDate: e.sessionDate,
      z: Number(e.z),
      score: Number(e.score),
      payload: (e.payload as Record<string, unknown>) ?? {},
    })),
    chart: bars
      .map((b) => ({ date: b.sessionDate, close: Number(b.adjClose) }))
      .reverse(),
    watchlist: {
      onWatchlist: Boolean(wl),
      thesis: wl?.thesis ?? null,
      positionSize: num(wl?.positionSize ?? null),
      lastSeenAt: seen?.lastSeenAt?.toISOString() ?? null,
    },
  };
}
