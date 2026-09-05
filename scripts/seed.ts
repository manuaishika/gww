/**
 * Seed the database from the committed dataset. No API keys, no network.
 *   - symbols  : 30 NSE equities + NIFTY 50   (src/lib/seed-data.ts)
 *   - bars_daily : ~250 real trading sessions  (src/lib/seed/bars.json)
 *   - quotes_latest : derived from each symbol's last two bars, with the
 *     staleness metadata the client contract requires (spec §7)
 *
 * Idempotent — safe to re-run. Regenerate bars.json with:
 *   node scripts/fetch-bars.mjs
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { barsDaily, newsEvents, quotesLatest, symbols } from "../src/lib/db/schema";
import { SEED_SYMBOLS, NIFTY_SYMBOL } from "../src/lib/seed-data";

type SeedBar = { d: string; o: number; h: number; l: number; c: number; ac: number; v: number };
type BarsFile = {
  generatedAt: string;
  sessions: string[];
  bars: Record<string, SeedBar[]>;
};

const url =
  process.env.DATABASE_URL ??
  "postgres://watchlist:watchlist@localhost:5432/watchlist";

// NSE closes at 15:30 IST = 10:00:00Z. Seed quotes are stamped at the close of
// their last session so the UI shows "as of close, <date>" rather than "live".
const closeTs = (isoDate: string) => new Date(`${isoDate}T10:00:00.000Z`);

async function main() {
  const barsFile = JSON.parse(
    readFileSync(join(process.cwd(), "src/lib/seed/bars.json"), "utf8"),
  ) as BarsFile;

  const client = postgres(url, {
    max: 1,
    ssl: url.includes("localhost") ? false : "require",
  });
  const db = drizzle(client);

  // ---- symbols -------------------------------------------------------------
  const symbolRows = [
    {
      symbol: NIFTY_SYMBOL,
      name: "NIFTY 50",
      exchange: "NSE",
      sector: "Index",
      listedOn: "1996-04-22",
      isActive: true,
    },
    ...SEED_SYMBOLS.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      exchange: "NSE",
      sector: s.sector,
      listedOn: s.listedOn,
      isActive: s.isActive ?? true,
    })),
  ];

  await db
    .insert(symbols)
    .values(symbolRows)
    .onConflictDoUpdate({
      target: symbols.symbol,
      set: {
        name: sql`excluded.name`,
        sector: sql`excluded.sector`,
        isActive: sql`excluded.is_active`,
      },
    });
  console.log(`✓ ${symbolRows.length} symbols`);

  // ---- bars_daily ---------------------------------------------------------
  const barRows: (typeof barsDaily.$inferInsert)[] = [];
  for (const [symbol, bars] of Object.entries(barsFile.bars)) {
    for (const b of bars) {
      barRows.push({
        symbol,
        sessionDate: b.d,
        open: String(b.o),
        high: String(b.h),
        low: String(b.l),
        close: String(b.c),
        adjClose: String(b.ac),
        volume: String(b.v),
      });
    }
  }

  const CHUNK = 1000;
  for (let i = 0; i < barRows.length; i += CHUNK) {
    await db
      .insert(barsDaily)
      .values(barRows.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }
  console.log(`✓ ${barRows.length} daily bars (${barsFile.sessions.length} sessions)`);

  // ---- quotes_latest ----------------------------------------------------
  const quoteRows: (typeof quotesLatest.$inferInsert)[] = [];
  for (const [symbol, bars] of Object.entries(barsFile.bars)) {
    if (bars.length < 2) continue;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    quoteRows.push({
      symbol,
      price: String(last.c),
      prevClose: String(prev.c),
      exchangeTs: closeTs(last.d),
      fetchedAt: new Date(),
      source: "seed",
      isDisputed: false,
      circuitState: "none",
    });
  }
  await db
    .insert(quotesLatest)
    .values(quoteRows)
    .onConflictDoUpdate({
      target: quotesLatest.symbol,
      set: {
        price: sql`excluded.price`,
        prevClose: sql`excluded.prev_close`,
        exchangeTs: sql`excluded.exchange_ts`,
        fetchedAt: sql`excluded.fetched_at`,
        source: sql`excluded.source`,
      },
    });
  console.log(`✓ ${quoteRows.length} quotes (source=seed, as of ${barsFile.sessions.at(-1)})`);

  // Staged example: circuit limits are real and unhandled by most submissions
  // (spec §9). We have no live feed to hit an actual circuit with, so one
  // symbol is flagged explicitly — SUNPHARMA is otherwise an ordinary quiet
  // day in the seed data, chosen so this doesn't collide with a real headline.
  // The volume detector checks this and suppresses itself (spec §4.3).
  await db
    .update(quotesLatest)
    .set({ circuitState: "upper" })
    .where(sql`${quotesLatest.symbol} = 'SUNPHARMA'`);
  console.log("✓ staged circuit-limit example: SUNPHARMA at upper circuit");

  // Staged example: a disputed quote (spec §7). No FINNHUB_API_KEY is
  // configured (see .env.example), so there's no live second source to
  // actually disagree with the first — the mechanism (is_disputed,
  // dispute_note, prefer-newer-exchange_ts) is real, but this one flag is
  // hand-set so the UI's disputed state is demonstrable without a key.
  await db
    .update(quotesLatest)
    .set({
      isDisputed: true,
      disputeNote:
        "Staged (spec §7) — no second source configured (FINNHUB_API_KEY unset). " +
        "This is what renders when two sources disagree by >0.5%: both shown, " +
        "the newer exchange_ts wins, and the disagreement is logged rather than hidden.",
    })
    .where(sql`${quotesLatest.symbol} = 'INFY'`);
  console.log("✓ staged disputed-quote example: INFY");

  // ---- news_events ---------------------------------------------------------
  const newsFile = JSON.parse(
    readFileSync(join(process.cwd(), "src/lib/seed/news.json"), "utf8"),
  ) as { events: { symbol: string; eventDate: string; kind: string }[] };
  await db.delete(newsEvents); // small + fully regenerated each run
  if (newsFile.events.length > 0) {
    await db.insert(newsEvents).values(
      newsFile.events.map((e) => ({
        symbol: e.symbol,
        eventDate: e.eventDate,
        kind: e.kind,
      })),
    );
  }
  console.log(`✓ ${newsFile.events.length} news/results events (illustrative — see DECISIONS.md)`);

  await client.end();
  console.log("\n✓ seed complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
