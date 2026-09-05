/**
 * Data model — spec §3.
 *
 * The split that matters: market data (`bars_daily`, `quotes_latest`,
 * `stats_daily`, `events`) is shared across all users. Per-user state is tiny
 * (`user_symbol_state`, `user_event_state`). Detection runs once per symbol,
 * not once per user — cost is O(symbols), not O(users × symbols).
 *
 * Money and prices are `numeric` (Postgres) handled as strings at the boundary.
 * No floats through the ORM. All return maths uses `adj_close`, never `close`.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  numeric,
  integer,
  boolean,
  jsonb,
  primaryKey,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountCode: text("account_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const symbols = pgTable("symbols", {
  symbol: text("symbol").primaryKey(), // NSE ticker, no suffix: "RELIANCE"
  name: text("name").notNull(),
  exchange: text("exchange").notNull().default("NSE"),
  sector: text("sector"),
  listedOn: date("listed_on"),
  isActive: boolean("is_active").notNull().default(true), // delisted/renamed → false
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol")
      .notNull()
      .references(() => symbols.symbol),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    thesis: text("thesis"), // "why am I watching this" — spec §8
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
  },
  (t) => ({
    userSymbol: unique("watchlist_items_user_symbol").on(t.userId, t.symbol),
    byUser: index("watchlist_items_user_idx").on(t.userId),
  }),
);

/** Shared across all users. This is the scaling story. */
export const barsDaily = pgTable(
  "bars_daily",
  {
    symbol: text("symbol").notNull(),
    sessionDate: date("session_date").notNull(),
    open: numeric("open"),
    high: numeric("high"),
    low: numeric("low"),
    close: numeric("close"),
    adjClose: numeric("adj_close"), // split/bonus-adjusted — use this for returns
    volume: numeric("volume"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.symbol, t.sessionDate] }),
  }),
);

export const quotesLatest = pgTable("quotes_latest", {
  symbol: text("symbol").primaryKey(),
  price: numeric("price"),
  prevClose: numeric("prev_close"),
  exchangeTs: timestamp("exchange_ts", { withTimezone: true }), // when the exchange says it happened
  fetchedAt: timestamp("fetched_at", { withTimezone: true }), // when we pulled it
  source: text("source"),
  isDisputed: boolean("is_disputed").notNull().default(false),
  disputeNote: text("dispute_note"),
  circuitState: text("circuit_state").notNull().default("none"), // 'none' | 'upper' | 'lower'
});

/** Precomputed once per session (spec §4). */
export const statsDaily = pgTable("stats_daily", {
  symbol: text("symbol").primaryKey(),
  sigma60: numeric("sigma_60"), // stdev of daily log returns, 60 sessions
  beta60: numeric("beta_60"), // vs ^NSEI
  residSigma60: numeric("resid_sigma_60"),
  volMedian30: numeric("vol_median_30"),
  volMad30: numeric("vol_mad_30"),
  high252: numeric("high_252"),
  low252: numeric("low_252"),
  sessionsAvailable: integer("sessions_available").notNull().default(0), // insufficient-history guard
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-symbol, shared. Deduped by `dedupeKey` (spec §4.7). */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    detector: text("detector").notNull(), // 'return_z' | 'idio_z' | 'volume_z' | 'structural' | ...
    sessionDate: date("session_date").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    score: numeric("score"),
    z: numeric("z"),
    payload: jsonb("payload"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySymbol: index("events_symbol_idx").on(t.symbol),
    byDetectedAt: index("events_detected_at_idx").on(t.detectedAt),
  }),
);

export const userSymbolState = pgTable(
  "user_symbol_state",
  {
    userId: uuid("user_id").notNull(),
    symbol: text("symbol").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), // the watermark
    lastSeenPrice: numeric("last_seen_price"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.symbol] }),
  }),
);

export const userEventState = pgTable(
  "user_event_state",
  {
    userId: uuid("user_id").notNull(),
    eventId: uuid("event_id").notNull(),
    status: text("status"), // 'dismissed' | 'acted' | 'read'
    actedAt: timestamp("acted_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.eventId] }),
  }),
);

/**
 * Phase 7 (spec §4.5, §4.6) — news density + silence detectors.
 * Structured event dates, not scraped headline text: no news API is wired up
 * (would need a key, breaking the no-keys guarantee), so this is seeded from
 * a small, clearly-illustrative results calendar. See DECISIONS.md.
 */
export const newsEvents = pgTable(
  "news_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    eventDate: date("event_date").notNull(),
    kind: text("kind").notNull(), // 'results' | 'headline'
    note: text("note"),
  },
  (t) => ({
    bySymbolDate: index("news_events_symbol_date_idx").on(t.symbol, t.eventDate),
  }),
);
