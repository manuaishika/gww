/**
 * Watchlist operations. All take a userId; none mint sessions.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  barsDaily,
  events,
  quotesLatest,
  symbols,
  userEventState,
  userSymbolState,
  watchlistItems,
} from "./db/schema";

const SPARKLINE_SESSIONS = 30;

export type WatchlistRow = {
  symbol: string;
  name: string;
  sector: string | null;
  isActive: boolean;
  thesis: string | null;
  addedAt: string;
  mutedUntil: string | null;
  lastSeenAt: string | null;
  positionSize: string | null;
  // Multi-market — per symbol, not global (spec addendum).
  exchange: string;
  currency: string;
  benchmarkSymbol: string;
  /** last ~30 sessions' adjClose, chronological — the table's sparkline. */
  sparkline: number[] | null;
  quote: {
    price: string | null;
    prevClose: string | null;
    source: string | null;
    exchangeTs: string | null;
    fetchedAt: string | null;
    circuitState: string | null;
    isDisputed: boolean | null;
  } | null;
};

export async function listWatchlist(userId: string): Promise<WatchlistRow[]> {
  const rows = await db
    .select({
      symbol: watchlistItems.symbol,
      name: symbols.name,
      sector: symbols.sector,
      isActive: symbols.isActive,
      thesis: watchlistItems.thesis,
      addedAt: watchlistItems.addedAt,
      mutedUntil: watchlistItems.mutedUntil,
      positionSize: watchlistItems.positionSize,
      exchange: symbols.exchange,
      currency: symbols.currency,
      benchmarkSymbol: symbols.benchmarkSymbol,
      lastSeenAt: userSymbolState.lastSeenAt,
      price: quotesLatest.price,
      prevClose: quotesLatest.prevClose,
      source: quotesLatest.source,
      exchangeTs: quotesLatest.exchangeTs,
      fetchedAt: quotesLatest.fetchedAt,
      circuitState: quotesLatest.circuitState,
      isDisputed: quotesLatest.isDisputed,
    })
    .from(watchlistItems)
    .innerJoin(symbols, eq(symbols.symbol, watchlistItems.symbol))
    .leftJoin(
      userSymbolState,
      and(
        eq(userSymbolState.userId, watchlistItems.userId),
        eq(userSymbolState.symbol, watchlistItems.symbol),
      ),
    )
    .leftJoin(quotesLatest, eq(quotesLatest.symbol, watchlistItems.symbol))
    .where(eq(watchlistItems.userId, userId))
    .orderBy(watchlistItems.addedAt);

  const sparklineBySymbol = await loadSparklines(rows.map((r) => r.symbol));

  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    isActive: r.isActive,
    thesis: r.thesis,
    addedAt: iso(r.addedAt),
    mutedUntil: r.mutedUntil ? iso(r.mutedUntil) : null,
    lastSeenAt: r.lastSeenAt ? iso(r.lastSeenAt) : null,
    positionSize: r.positionSize,
    sparkline: sparklineBySymbol.get(r.symbol) ?? null,
    exchange: r.exchange,
    currency: r.currency,
    benchmarkSymbol: r.benchmarkSymbol,
    quote:
      r.price == null && r.source == null
        ? null
        : {
            price: r.price,
            prevClose: r.prevClose,
            source: r.source,
            exchangeTs: r.exchangeTs ? iso(r.exchangeTs) : null,
            fetchedAt: r.fetchedAt ? iso(r.fetchedAt) : null,
            circuitState: r.circuitState,
            isDisputed: r.isDisputed,
          },
  }));
}

/**
 * Batched: one query for every watched symbol's sparkline, not one per row —
 * poll/read cost stays O(distinct symbols), never O(items) (README architecture).
 */
async function loadSparklines(symbolList: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (symbolList.length === 0) return out;

  const rows = await db
    .select({
      symbol: barsDaily.symbol,
      sessionDate: barsDaily.sessionDate,
      adjClose: barsDaily.adjClose,
    })
    .from(barsDaily)
    .where(inArray(barsDaily.symbol, symbolList))
    .orderBy(asc(barsDaily.sessionDate));

  const bySymbol = new Map<string, number[]>();
  for (const r of rows) {
    const arr = bySymbol.get(r.symbol) ?? [];
    if (r.adjClose != null) arr.push(Number(r.adjClose));
    bySymbol.set(r.symbol, arr);
  }
  for (const [symbol, closes] of bySymbol) {
    out.set(symbol, closes.slice(-SPARKLINE_SESSIONS));
  }
  return out;
}

export async function addToWatchlist(
  userId: string,
  symbol: string,
  thesis?: string | null,
  positionSize?: number | null,
): Promise<{ added: boolean }> {
  const [sym] = await db
    .select({ symbol: symbols.symbol })
    .from(symbols)
    .where(eq(symbols.symbol, symbol));
  if (!sym) throw new Error(`unknown symbol: ${symbol}`);

  const inserted = await db
    .insert(watchlistItems)
    .values({
      userId,
      symbol,
      thesis: thesis?.trim() || null,
      positionSize: positionSize != null ? String(positionSize) : null,
    })
    .onConflictDoNothing({
      target: [watchlistItems.userId, watchlistItems.symbol],
    })
    .returning({ addedAt: watchlistItems.addedAt });

  if (inserted.length === 0) return { added: false };

  // Just-added symbol has no baseline: watermark = added_at ("watching from today").
  await db
    .insert(userSymbolState)
    .values({ userId, symbol, lastSeenAt: inserted[0].addedAt })
    .onConflictDoNothing({
      target: [userSymbolState.userId, userSymbolState.symbol],
    });

  return { added: true };
}

export async function removeFromWatchlist(userId: string, symbol: string) {
  await db
    .delete(watchlistItems)
    .where(
      and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol)),
    );
}

export async function updateWatchlistItem(
  userId: string,
  symbol: string,
  patch: { thesis?: string | null; mutedUntil?: string | null; positionSize?: number | null },
): Promise<boolean> {
  const set: Record<string, unknown> = {};
  if ("thesis" in patch) set.thesis = patch.thesis?.trim() || null;
  if ("mutedUntil" in patch) {
    set.mutedUntil = patch.mutedUntil ? new Date(patch.mutedUntil) : null;
  }
  if ("positionSize" in patch) {
    set.positionSize = patch.positionSize != null ? String(patch.positionSize) : null;
  }
  if (Object.keys(set).length === 0) return false;

  const res = await db
    .update(watchlistItems)
    .set(set)
    .where(
      and(eq(watchlistItems.userId, userId), eq(watchlistItems.symbol, symbol)),
    )
    .returning({ symbol: watchlistItems.symbol });
  return res.length > 0;
}

/**
 * Advance watermarks — on dismiss or explicit mark-as-read, never on
 * page load. The update is GREATEST(existing, incoming), so two devices can't
 * rewind each other.
 */
export async function markSeen(
  userId: string,
  opts: { symbol?: string; eventIds?: string[]; all?: boolean },
): Promise<{ dismissed: number; advanced: number }> {
  let dismissed = 0;
  let advanced = 0;

  if (opts.eventIds && opts.eventIds.length > 0) {
    const evs = await db
      .select({
        id: events.id,
        symbol: events.symbol,
        detectedAt: events.detectedAt,
      })
      .from(events)
      .where(inArray(events.id, opts.eventIds));

    for (const e of evs) {
      await db
        .insert(userEventState)
        .values({ userId, eventId: e.id, status: "dismissed", actedAt: new Date() })
        .onConflictDoUpdate({
          target: [userEventState.userId, userEventState.eventId],
          set: { status: "dismissed", actedAt: new Date() },
        });
      dismissed++;
      advanced += await advanceWatermark(userId, e.symbol, e.detectedAt);
    }
    return { dismissed, advanced };
  }

  const targets = opts.all
    ? (
        await db
          .select({ symbol: watchlistItems.symbol })
          .from(watchlistItems)
          .where(eq(watchlistItems.userId, userId))
      ).map((r) => r.symbol)
    : opts.symbol
      ? [opts.symbol]
      : [];

  const now = new Date();
  for (const symbol of targets) {
    advanced += await advanceWatermark(userId, symbol, now);
  }
  return { dismissed, advanced };
}

async function advanceWatermark(
  userId: string,
  symbol: string,
  to: Date,
): Promise<number> {
  const res = await db
    .insert(userSymbolState)
    .values({ userId, symbol, lastSeenAt: to })
    .onConflictDoUpdate({
      target: [userSymbolState.userId, userSymbolState.symbol],
      set: {
        lastSeenAt: sql`greatest(${userSymbolState.lastSeenAt}, excluded.last_seen_at)`,
      },
    })
    .returning({ symbol: userSymbolState.symbol });
  return res.length;
}

const iso = (d: Date | string): string =>
  typeof d === "string" ? d : d.toISOString();
