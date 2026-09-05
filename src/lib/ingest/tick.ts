/**
 * The ingest tick — the backbone the digest sits on top of.
 *
 * What it does, in order:
 *   1. take a Postgres advisory lock so two overlapping ticks can't collide
 *   2. work out the union of DISTINCT symbols anyone is watching (+ their
 *      benchmarks) — cost is O(distinct symbols), never O(users × symbols)
 *   3. for each: fetch a quote + recent bars from yahoo-finance2, reconcile
 *      against Finnhub if a key is configured
 *   4. a fetch that fails for one symbol is logged and skipped — the run
 *      continues, and that symbol keeps serving its last-known-good quote,
 *      now visibly stale (spec's "unreliable dependencies")
 *   5. refresh stats + run incremental detection for what actually changed
 *   6. release the lock
 *
 * Idempotent: re-running inserts no duplicate bars or events (`dedupe_key`),
 * and the advisory lock means a slow run can't be lapped by the next one.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { barsDaily, quotesLatest, symbols, watchlistItems } from "../db/schema";
import { NIFTY_SYMBOL, SPX_SYMBOL } from "../seed-data";
import { getFinnhubQuote } from "./finnhub";
import { reconcileQuotes } from "./reconcile";
import { fetchQuote, fetchRecentBars } from "./yahoo";
import { detectForSymbol, loadBars, refreshStats } from "../detect-run";

const LOCK_KEY = 4242; // arbitrary, fixed — one ingest at a time

export type TickResult = {
  ranAt: string;
  skipped?: string;
  polled: number;
  quotesUpdated: number;
  barsInserted: number;
  failed: { symbol: string; reason: string }[];
  eventsDetected: number;
};

export async function runTick(opts: { only?: string[] } = {}): Promise<TickResult> {
  const ranAt = new Date().toISOString();

  const [{ locked }] = await db.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_lock(${LOCK_KEY}) as locked`,
  );
  if (!locked) {
    return {
      ranAt,
      skipped: "another ingest run holds the lock",
      polled: 0,
      quotesUpdated: 0,
      barsInserted: 0,
      failed: [],
      eventsDetected: 0,
    };
  }

  try {
    const targets = opts.only ?? (await unionOfWatchedSymbols());
    const finnhubOn = Boolean(process.env.FINNHUB_API_KEY);

    let quotesUpdated = 0;
    let barsInserted = 0;
    let eventsDetected = 0;
    const failed: TickResult["failed"] = [];
    const touched = new Set<string>();

    // ---- fetch + upsert, symbol by symbol, failure-isolated ----
    for (const symbol of targets) {
      try {
        const [bars, primary] = await Promise.all([
          fetchRecentBars(symbol),
          fetchQuote(symbol),
        ]);

        if (bars.length > 0) {
          const res = await db
            .insert(barsDaily)
            .values(
              bars.map((b) => ({
                symbol,
                sessionDate: b.sessionDate,
                open: String(b.open),
                high: String(b.high),
                low: String(b.low),
                close: String(b.close),
                adjClose: String(b.adjClose),
                volume: String(b.volume),
              })),
            )
            .onConflictDoNothing()
            .returning({ d: barsDaily.sessionDate });
          barsInserted += res.length;
          if (res.length > 0) touched.add(symbol);
        }

        if (!primary) {
          failed.push({ symbol, reason: "no quote from primary source" });
          continue; // keep serving the last-known-good quote; it just ages

        }

        const secondary = finnhubOn
          ? await getFinnhubQuote(symbol).then((q) =>
              q ? { price: q.price, source: "finnhub", exchangeTs: q.timestamp } : null,
            )
          : null;

        const reconciled = reconcileQuotes(
          { price: primary.price, source: "yahoo-finance2", exchangeTs: primary.exchangeTs },
          secondary,
        );

        await db
          .insert(quotesLatest)
          .values({
            symbol,
            price: String(reconciled.price),
            prevClose: primary.prevClose == null ? null : String(primary.prevClose),
            exchangeTs: reconciled.exchangeTs,
            fetchedAt: new Date(),
            source: reconciled.source,
            isDisputed: reconciled.isDisputed,
            disputeNote: reconciled.disputeNote,
          })
          .onConflictDoUpdate({
            target: quotesLatest.symbol,
            set: {
              price: sql`excluded.price`,
              prevClose: sql`excluded.prev_close`,
              exchangeTs: sql`excluded.exchange_ts`,
              fetchedAt: sql`excluded.fetched_at`,
              source: sql`excluded.source`,
              isDisputed: sql`excluded.is_disputed`,
              disputeNote: sql`excluded.dispute_note`,
              // circuit_state is deliberately not touched here — it comes from
              // a separate signal, not the quote feed
            },
          });
        quotesUpdated++;
      } catch (err) {
        failed.push({
          symbol,
          reason: err instanceof Error ? err.message : "unknown fetch error",
        });
        // no quote write — the row keeps its last value and ages into 'stale'
      }
    }

    // ---- stats + incremental detection for what actually changed ----
    if (touched.size > 0) {
      const benchmarks = await benchmarkBarsFor([...touched]);
      // benchmarks first, so a stock's stats regress against fresh index bars
      const ordered = [...touched].sort((a, b) =>
        isBenchmark(a) === isBenchmark(b) ? 0 : isBenchmark(a) ? -1 : 1,
      );
      for (const symbol of ordered) {
        if (isBenchmark(symbol)) continue;
        const bench = benchmarks.get(symbol);
        if (!bench) continue;
        await refreshStats(symbol, bench);
        eventsDetected += await detectForSymbol(symbol, bench, 6, currencyGuess(symbol));
      }
    }

    return { ranAt, polled: targets.length, quotesUpdated, barsInserted, failed, eventsDetected };
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
  }
}

// ---- helpers ----

async function unionOfWatchedSymbols(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ symbol: watchlistItems.symbol, benchmark: symbols.benchmarkSymbol })
    .from(watchlistItems)
    .innerJoin(symbols, and(eq(symbols.symbol, watchlistItems.symbol), eq(symbols.isActive, true)));

  const set = new Set<string>([NIFTY_SYMBOL, SPX_SYMBOL]);
  for (const r of rows) {
    set.add(r.symbol);
    set.add(r.benchmark);
  }
  return [...set];
}

const isBenchmark = (s: string) => s === NIFTY_SYMBOL || s === SPX_SYMBOL;
const currencyGuess = (s: string) =>
  ["AAPL", "MSFT", "GOOGL", SPX_SYMBOL].includes(s) ? "USD" : "INR";

async function benchmarkBarsFor(syms: string[]) {
  const rows = await db
    .select({ symbol: symbols.symbol, benchmark: symbols.benchmarkSymbol })
    .from(symbols)
    .where(inArray(symbols.symbol, syms));

  type Bars = Awaited<ReturnType<typeof loadBars>>;
  const cache = new Map<string, Bars>();
  const out = new Map<string, Bars>();
  for (const { symbol, benchmark } of rows) {
    let bars = cache.get(benchmark);
    if (!bars) {
      bars = await loadBars(benchmark);
      cache.set(benchmark, bars);
    }
    out.set(symbol, bars);
  }
  return out;
}
