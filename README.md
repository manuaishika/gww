# Notice

A smart market watchlist that surfaces what you'd want to be *notified* about.

**Live:** https://gww-ten.vercel.app — open the app, pick **Example watchlist → Load it** (account code `GRW-24X`) to see it populated with NSE and US holdings.

Notice answers one question: **what changed since you last looked that
actually matters, and why should you care?** Every stock is measured against its
own recent volatility and its own market's benchmark — NIFTY for NSE, the S&P 500
for US names — because a 3% day means something different for every name. No
broker login anywhere: the app never needs to know what you paid or hold, only —
optionally — how much, so a big move in something you barely own doesn't get
buried under one you don't.

---

## Setup

Needs Node 20+ and Docker. **No API keys.**

```bash
npm install
npm run setup     # Postgres + migrations + committed seed data + detectors + demo account
npm run dev       # http://localhost:3000
npm test          # 38 unit tests, no DB needed
```

`npm run setup` uses `DATABASE_URL` if set (e.g. a free Neon instance) and skips
Docker. Seed data is committed — 30 NSE stocks + NIFTY, 3 US stocks + the S&P 500,
~250 real sessions each on its own trading calendar — so a clean clone has real
data across two markets with no keys. Regenerate: `node scripts/fetch-bars.mjs`.
An optional `FINNHUB_API_KEY` (`.env.example`) adds a second price source; the
app is fully functional without it.

---

## How "meaningful" is computed

Engine: `src/lib/detectors/**` — pure functions, no DB, no clock, every threshold
in `config.ts`. One pass feeds six detectors and the scorer; `detectSymbol` emits
**one event per (symbol, session)**, the dominant signal on top and the rest in
the payload.

**Return z-score** — `z_ret = ln(adjClose_now / adjClose_base) / (σ₆₀·√h)`, where
`h` is trading sessions elapsed (clamped to `[0.25, 20]`) and `σ₆₀` is the stdev
of daily log returns over 60 sessions. This is the answer to "what counts as
meaningful": how many standard deviations is this move, *for this stock*, over
*this many* days. `|z| ≥ 2` fires.

**Idiosyncratic move — what we rank on** —
`β₆₀ = cov(r_stock, r_bench) / var(r_bench)`;
`z_idio = (r_stock − β₆₀·r_bench) / (residσ₆₀·√h)`. A stock that rose because its
market rose is not news about the company. Cards show the split:
`+4.1% total — 1.0% market, 3.0% company`. Seed betas come out textbook-correct
(BAJFINANCE ≈ 1.6, DRREDDY ≈ 0.3, COALINDIA ≈ 0).

**Volume** — `z_vol = (v_today − median₃₀) / (1.4826·MAD₃₀)`. Median and MAD, not
mean and stdev — one results day poisons a mean. Suppressed entirely when the
stock is circuit-locked (no two-way market).

**Structural breaks** — new 252-session high/low on adjusted close, an overnight
gap of `|ln(open/prevClose)| / σ₆₀ > 2`, or the first 50-DMA cross in ≥ 20 sessions.

**News density** — ≥ 2 dated headlines/results in the trailing 7 days. Fires with
no price move at all — a cluster of coverage nobody's repriced yet.

**Silence** — a headline/results event in the last 10 days **and** `|z_idio| < 0.5`
since: *"results were out recently, the stock hasn't moved — either the market
already knew or nobody's looked yet."* No live news feed (would need a key); runs
against a small committed, clearly-illustrative results calendar.

**Score** — `100 · sigmoid(w_idio·|z_idio| + w_ret·excess_ret +
w_vol·min(max(0,z_vol−1),6) + w_struct·flags + w_news·(density ∨ silence))`.
Events dedupe on `symbol:date:floor(|z|)`; a symbol can't re-fire within 3
sessions unless its peak `|z|` grew by ≥ 1 — walked session-by-session so this
holds on a first backfill, not just incrementally.

**Sector-move clustering** (`src/lib/sector-cluster.ts`) — `idio_z` is a
single-factor model: it strips out NIFTY, not the sector. If ≥ 3 watched symbols
in the same sector fire `idio_z` the same session, that's a sector factor the
model can't separate from company news, not 3 independent stories — collapsed
into one card. Real unstaged example in the seed: `TCS`, `INFY`, `WIPRO`,
`HCLTECH` all fired `idio_z` on 2026-02-12, a genuine same-day IT-sector move in
unmodified prices.

**Multi-market** — `currency`, `exchange`, `timezone` and `benchmark_symbol` are
per-symbol columns, not global constants. NSE stocks regress against NIFTY;
`AAPL`/`MSFT`/`GOOGL` against the S&P 500 (`SPX500`, real Yahoo data, its own
trading calendar). **No currency conversion, anywhere** — a z-score is unitless,
so an AAPL move and a RELIANCE move compare on materiality with no FX rate
involved; only the raw-price display needs `$` vs `₹`.

**Position size** — one optional number per watchlist item (shares/units, no
valuation, no broker link). Adds a small, bounded, saturating bonus (max 8 points
on a 0–100 scale) to *this user's* ranking only — never the shared `events.score`.
Unit-tested that a huge position on a trivial move can never outrank a real signal
in something you barely hold.

---

## Architecture

```
ingest (Vercel Cron) ──poll union of watched symbols──> bars_daily, quotes
                                  │  once per symbol
                          detectors (pure, no DB) ─────> events  (shared across users)
                                  │
              per user: 2 small tables (watermark + event state)
                                  │
                   GET /api/digest ──> one indexed query, capped at 5
```

Detection is **per symbol, shared** — 10,000 users watching RELIANCE means one
detection; per-user cost is one row per watched symbol.

The **ingest tick** (`src/lib/ingest/tick.ts`, `npm run tick`, wired to Vercel
Cron via `vercel.json`) polls `selectDistinct` watched symbols — O(symbols), never
O(users × symbols) — isolates per-symbol failures (a dead ticker is logged and
skipped, that symbol keeps its last-known-good quote and ages into "stale"), takes
a Postgres advisory lock against overlap, and is idempotent. The deployed demo
leaves it **off** (`ENABLE_INGEST` unset) so the staged edge-case examples stay
stable for a reviewer.

The API is ~12 JSON routes under `src/app/api/` (`session`, `watchlist`, `digest`,
`symbols/:symbol`, `trending`, `universe`, `seen`, `data-health`, `cron/tick`, …);
the UI is a thin client over them — one page, three views (Digest / Table /
Discover). Green/red is **direction only, never magnitude**; amber is reserved for
stale or disputed data. Card copy is templated from event payloads — no LLM. Four
hand-rolled SVG charts (absence, decomposition, z-context, sparkline), no charting
library.

---

## Edge cases

All 13 from the brief, unit-tested where noted (38 tests total, `src/lib/**/*.test.ts`):

- **Splits & bonus issues** — all return maths on `adj_close`; a 1:2 split fires no detector *(unit tested)*
- **Circuit limits** — volume detector returns null when `circuit_state ≠ none`; staged in the seed: `SUNPHARMA` flagged `upper` *(unit tested)*
- **Insufficient history** — `< 60` sessions → no event, rather than firing on noise *(unit tested)*
- **Market holidays** — session calendar is the observed `^NSEI` session set, not weekday math; horizon counted in sessions *(unit tested)*
- **Very long absence** — horizon `h` clamped to 20 sessions so `√h` doesn't saturate
- **Just-added symbol** — no "since" baseline → falls back to a `lookback` set of recent events, not a blank digest
- **Concurrent devices** — watermark advance is `GREATEST(existing, incoming)`, can't rewind
- **Clock skew** — a future `exchange_ts` is rejected, falls back to `fetched_at`
- **Duplicate cron runs** — idempotent via the `events.dedupe_key` unique constraint
- **Delisted / renamed** — `TATAMOTORS` (real, demerged 2025): kept `is_active = false`, rendered at 50% opacity, not crashed
- **Zero-volume session** — MAD baseline guarded against `MAD = 0` *(unit tested)*
- **500-symbol watchlist** — digest caps at 5 in `digest.ts`, not a UI truncation
- **Float precision** — `numeric` columns throughout, strings at the ORM boundary

Beyond the list: three distinct empty states (no watchlist / just-added / quiet);
disputed-quote path (staged: `INFY`) always paired with a reason; a cold deploy
with no `DATABASE_URL` still renders; `getFinnhubQuote()` returns `null` gracefully
when a symbol isn't on the free tier; US bars aligned to `^GSPC`'s own calendar.

---

## Deliberately not built

Websockets, portfolio P&L, options, backtesting, full-page charts, push
notifications, multiple watchlists.

**No broker OAuth, ever.** Identity is a 6-character account code, not an auth
provider. The only broker-adjacent input is an optional typed position size
(shares/units, no credentials), bounded so it can never override a real signal.

**No LLM narration.** Every number on a card traces back to the detector engine
with nothing in between that could hallucinate a percentage; template-composed
copy (`card-copy.ts`) is the whole narration layer.
