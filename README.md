# Smart Market Watchlist

*Working title — final name TBD.*

A diff engine for your watchlist, NSE or otherwise. It answers one question:
**what changed since you last looked that actually matters, and why should
you care?** Every stock regresses against its own market's benchmark — NIFTY
for NSE, the S&P 500 for US names — with no currency conversion, because a
z-score doesn't need one. There's no broker login anywhere in this app: it
never needs to know what you paid or hold, only — optionally — how much, so a
3-sigma move in something you barely own doesn't get lost under one you don't.
Every headline card carries a chart, not just a number.

> **Status: the full brief, plus a fair bit past it.** Scaffold, schema, a
> live deploy, ~250 real trading sessions across two markets, the detector
> engine (return z, idiosyncratic z, volume z, structural breaks, news
> density, silence, sector-move clustering) with 38 unit tests, the full API,
> the UI (digest cards with 3 charts, sparkline table, Discover tab,
> position-size ranking), all 13 edge cases from `SPEC.md` §9, a real
> ingest tick (overlap-locked, failure-isolated, Vercel Cron), a degrading
> second-source integration + data-health panel. **Not built, on purpose:**
> LLM narration and broker OAuth — both explicitly rejected, not omitted; see
> `DECISIONS.md`. See [`PITCH.md`](./PITCH.md) for the pitch,
> [`DECISIONS.md`](./DECISIONS.md) for the "why," including three real bugs
> found and fixed along the way (a cooldown gap, a `detected_at` timestamp
> bug that made "since you last checked" less exact than it looked, and a
> sector-clustering ordering bug).
>
> **Fastest way to see it populated:** open the app and, under **Example
> watchlist**, click **Load it** (account code `GRW-24X`) — NSE and US holdings
> side by side.

**Live:** https://gww-ten.vercel.app

---

## Setup

Needs Node 20+ and Docker. **No API keys.**

```bash
git clone https://github.com/manuaishika/gww.git
cd gww
npm install
npm run setup     # Postgres + migrations + seed data + detectors + a populated demo account
npm run dev       # http://localhost:3000
npm test          # 38 unit tests (detectors, calendar, clustering, ranking, reconcile), no DB needed
```

`npm run setup` also works against a remote database — set `DATABASE_URL` (e.g. a
free Neon instance) and it skips Docker.

The seed data (`src/lib/seed/bars.json`, ~740 KB, and `news.json`) is
committed — 30 NSE stocks + NIFTY, 3 US stocks + the S&P 500, each aligned to
its own market's calendar — so the clone has real data across two markets with
**no API keys**. Regenerate from source: `node scripts/fetch-bars.mjs` (uses
yahoo-finance2) and `npx tsx scripts/generate-news.ts`. An optional
`FINNHUB_API_KEY` (see `.env.example`) enables a real second price source —
the app is fully functional without it.

---

## The thesis

A watchlist's job is not to show you prices. Groww already does that. The job is
to tell you what moved while you were away — and to be honest that a 3% day means
something different for every stock.

Three claims the product makes:

1. **Magnitude is not materiality.** Every change is normalised against the
   instrument's own recent volatility, not a fixed percentage threshold.
2. **"Since you last checked" is the only correct *default* baseline** — not
   24h, not today's open. (A daily / weekly / monthly window is one click away
   for a deliberate review, but it's never the default — see `DECISIONS.md`.)
3. **The product's job is to say less.** The digest caps at five. A watchlist
   that surfaces everything has surfaced nothing.

---

## How "meaningful" is computed

The engine is `src/lib/detectors/**` — pure functions, no DB, no clock, every
threshold in `config.ts`. One `computeSignals` pass feeds all six detectors and
the scorer. `detectSymbol` composes ONE event per (symbol, session) — the
dominant signal headlines it, everything else rides along in the payload.

**1. Return z-score** (`src/lib/detectors` §4.1)

```
r       = ln(adjClose_now / adjClose_baseline)
h       = trading sessions elapsed (clamped to [0.25, 20])
z_ret   = r / (σ₆₀ · √h)
```

`σ₆₀` is the sample stdev of daily log returns over 60 sessions. `|z| ≥ 2` fires,
`≥ 3` is labelled strong. This is the answer to "what counts as meaningful": how
many standard deviations is this move, *for this stock*, over *this many* days.

**2. Idiosyncratic move — the one we rank on** (§4.2)

```
β₆₀      = cov(r_stock, r_benchmark) / var(r_benchmark)      over 60 sessions
residual = r_stock − β₆₀ · r_benchmark
z_idio   = residual / (residσ₆₀ · √h)
```

`r_benchmark` is NIFTY for an NSE stock, the S&P 500 for a US one — whatever
`symbols.benchmark_symbol` says (multi-market, below). A stock that rose
because its market rose is not news about the company. We subtract
`β₆₀ · r_benchmark` and z-score what's left. The card shows the split:
`+4.1% total — 1.0% market, 3.0% company`. (Seed betas come out textbook-correct:
BAJFINANCE ≈ 1.6, DRREDDY ≈ 0.3, COALINDIA ≈ 0.)

**3. Volume anomaly** (§4.3) — `z_vol = (v_today − median₃₀) / (1.4826 · MAD₃₀)`.
Median and MAD, not mean and stdev — one results day poisons a mean. The baseline
is the 30 sessions *before* today, and it's suppressed entirely when the stock is
circuit-locked (no two-way market).

**4. Structural breaks** (§4.4) — binary flags: new 252-session high/low (on
adjusted close), an overnight gap of `|ln(open/prevClose)| / σ₆₀ > 2`, or the
first 50-DMA cross in ≥ 20 sessions.

**5. News density** (§4.5) — ≥ 2 dated headlines/results in the trailing 7
days. Fires with no price move at all; the whole point is a cluster of
coverage nobody's repriced yet.

**6. Silence — the memorable one** (§4.6) — a results/headline event in the
last 10 days **and** `|z_idio| < 0.5` since. *"Results were out recently. The
stock hasn't moved — either the market already knew, or nobody's looked yet."*
No live news feed is wired up for either of these (would need a key); they run
against a small committed, clearly-illustrative results calendar — see
`DECISIONS.md` for the two examples staged against real price data.

**Scoring** (§4.7) — `score = 100 · sigmoid(w_idio·|z_idio| + w_ret·excess_ret
+ w_vol·min(max(0,z_vol−1),6) + w_struct·flags + w_news·(density ∨ silence))`.
News/silence are binary, fixed-contribution terms like structural flags —
there's no natural z-score for "a headline count" or "the absence of a move."
Events dedupe on `symbol:date:floor(|z|)` (re-running changes nothing; a real
escalation crosses the floor and makes a new row), and a symbol can't re-fire
within 3 sessions unless its peak `|z|` grew by ≥ 1 — walked session-by-session
so this holds on a first backfill, not just incrementally (a real bug, found
and fixed; see `DECISIONS.md`).

**Sector-move clustering** (`src/lib/sector-cluster.ts`, not in the original
spec — found by pushing on the model's own limits) — `idio_z` is a
*single-factor* model: it strips out NIFTY, not the sector. If ≥3 watched
symbols in the same sector fire `idio_z` the same session, that's not 3
independent company stories, it's a sector factor the model can't separate
from real company news. A real example is sitting in the seed data, not
staged: `TCS`, `INFY`, `WIPRO`, `HCLTECH` all fired `idio_z` on **2026-02-12**
— a genuine same-day IT-sector move in unmodified NSE prices. The digest
collapses a cluster like that into one card ("moved with 3 other IT holdings —
likely sector-wide, not company-specific") instead of letting one sector event
occupy 3 of the 5 headline slots. Pure, unit tested against that exact event.

**Multi-market** — `currency`, `exchange`, `timezone` and `benchmark_symbol`
are columns on `symbols`, not global constants (`src/lib/db/schema.ts`). An
NSE stock's `beta_60`/`resid_sigma_60` come from regressing against NIFTY;
`AAPL`/`MSFT`/`GOOGL` regress against the S&P 500 (`SPX500` in the seed,
real Yahoo data, its own trading calendar — NYSE holidays don't line up with
NSE's, so US bars are aligned to `^GSPC`'s own session set, never NSE's).
**No currency conversion, anywhere** — a z-score is unitless, so an AAPL move
and a RELIANCE move compare on materiality with no FX rate involved. Only the
raw-price display needs to know the symbol's currency (`$` vs `₹`).

**Position size** (`src/lib/position-weight.ts`) — one optional number per
watchlist item (shares/units — no valuation, no broker link). It adds a small,
*bounded and saturating* bonus to score at digest time: `100 · position /
(position + 100)`th of 8 points, capped so a huge position with a trivial move
can never outrank a real signal in something you barely hold — verified in
the unit tests (`effectiveScore(21, 1_000_000) < effectiveScore(95, 1)`,
always). It never touches the shared `events.score` column — detection stays
per-symbol and shared; only this user's ranking preference is personal.

---

## API

Every route is real and returns JSON; the UI is a thin client over these.

| Route | What |
|---|---|
| `GET /api/session` | Who am I? Mints an account + httpOnly cookie on first visit. |
| `POST /api/session/adopt` | `{ code }` → adopt that account on this device (spec §6). |
| `GET /api/symbols/search?q=` | Local symbol search across every seeded market. |
| `GET /api/trending` | Global, no session needed: what the detector actually found recently, across everyone's shared symbols. What a brand-new visitor sees first. |
| `GET /api/universe` | Every watchable symbol grouped by sector, with a per-user "already watching" flag — the Discover tab's browse view. |
| `GET /api/watchlist` | Items with thesis, position size, watermark, latest quote, currency, sparkline. |
| `POST /api/watchlist` | `{ symbol, thesis?, positionSize? }` → add. Watermark = now ("watching from today"). |
| `PATCH /api/watchlist/:symbol` | Edit thesis / mute / position size. |
| `DELETE /api/watchlist/:symbol` | Remove. |
| `POST /api/seen` | `{ eventIds }` \| `{ symbol }` \| `{ all }` → advance the watermark. Never called on page load (spec §5). |
| `GET /api/digest?window=` | The ranked digest — headlines (≤ 5, decomposition, chart), a collapsed "N smaller changes", the away-time header. `window` is `checked` (default, your own watermark), `1`, `7` or `30` sessions for a daily / weekly / monthly review. |
| `GET /api/data-health` | Global, not per-user: which sources are configured, disputed quotes, circuit-locked symbols (spec §7, optional). |
| `GET /api/cron/tick` | The ingest tick — polls the union of watched symbols. Guarded by `CRON_SECRET` + `ENABLE_INGEST`; off on the demo, real code (`src/lib/ingest/tick.ts`). |
| `GET /api/symbols/:symbol` | The bigger picture for one name: quote + provenance, stats, recent events, 90-day chart, your watchlist state. |

`GET /api/digest` after adopting `GRW-24X` (numbers illustrative — `awayDays`
tracks real elapsed time):

```json
{
  "window": "checked", "windowLabel": "since you last checked",
  "awayDays": 35, "awaySessions": 25, "watching": 12,
  "headlines": [{
    "symbol": "TITAN", "detector": "idio_z", "z": 2.84, "score": 95, "currency": "INR",
    "positionSize": 400, "positionBonus": 6.4,
    "thesis": "Discretionary bellwether — reads through to urban demand.",
    "sinceLastSeen": { "sessions": 25, "totalPct": 3.11, "marketPct": -1.67, "companyPct": 4.87 },
    "chart": { "closes": [ /* 60 sessions */ ], "zHistory": [ /* 59 daily z's */ ], "watermarkDate": "2026-08-03" }
  }],
  "lookback": [ /* recent events, only when you just started watching and nothing has happened since */ ],
  "quieter": { "count": 22, "symbols": [{ "symbol": "COALINDIA", "count": 4 }] }
}
```

`window` is `1` / `7` / `30` for a daily / weekly / monthly review — the filter
switches from your watermark to a fixed session count and `windowLabel` names it.

Note `AAPL`/`MSFT` also sit in this watchlist with `currency: "USD"` — same
shape, same digest, different market, no conversion anywhere.

---

## The UI

One page, three views — **Digest** (the ranked "what changed"), **Table** (the
full watchlist with sparklines, theses and position sizes) and **Discover**
(trending + browse-by-sector). Design follows spec §10 — the argument is
*magnitude is not meaning*, so the interface doesn't lead with colour:

- **Hero is the time gap** — "3 days away" as a large numeral, not a logo or a
  ticker grid.
- **Green/red is direction only, never magnitude.** A 0.3% move and a 12%
  move get the same green — colour tells you *which way*, the card's size and
  its materiality bar tell you *whether to care*. That's the distinction the
  spec (§10) draws when it warns against red-green-*by-percentage*.
- **Amber is reserved** for stale or disputed data only — nowhere else.
- **Click a company name anywhere** (digest, table, Discover, trending) → a
  detail modal: the quote with provenance, computed stats (beta, volatility),
  every recent detector event with its one-line explanation, the 90-day
  chart, and your watchlist state with add/remove. `GET /api/symbols/:symbol`.
- **Card copy is templated**, not generated: `card-copy.ts` turns a detector's
  payload into one sentence (`"+4.1% total — 0.6% was the market, 3.5% was the
  company."`). No LLM (spec §8, `CLAUDE.md`).
- **Three empty states, not one** — no watchlist ("add a symbol"), just-added
  ("nothing since — here's the recent history," a `lookback` set of real
  events), and genuinely quiet ("every move stayed inside its own range").
- **Discover tab** — always there (not just the first screen): the trending
  list (`GET /api/trending`, global, no session — the detector's own recent
  output across the whole universe) plus browse-by-sector (`GET /api/universe`,
  sectors → companies, "+ watch" inline). The search box has a dropdown on
  empty focus: recently added + notable this week.
- **Cross-device is a QR code** — the account bar renders a QR of
  `<origin>/?sync=<code>`; scan it with a phone camera and the app opens
  already synced. No email provider (would break the no-keys guarantee), no
  remembering a string.
- **Four cheap charts, hand-rolled SVG, no charting library** (spec addendum —
  deviates from the original Recharts-for-sparklines decision; see
  `DECISIONS.md` for why). Three sit on the headline card, collapsed behind a
  "show chart" toggle so 5 cards don't turn into a wall of charts; the fourth
  (sparkline) is one per table row:
  - **Absence chart** — the last 60 sessions' price, with the window since you
    last checked shaded. You see the gap you missed, not a number describing it.
  - **Decomposition bar** — the move split into market and company portions,
    as two bars on a shared scale. The thesis, as a picture.
  - **Z-context strip** — this move plotted against the stock's own last ~60
    daily moves; the outlier is visible, not asserted.
  - **Sparkline** in the table, one per row, batched in the same query as
    everything else — no per-row round trip.

`src/components/app/` — `app-shell.tsx` owns data + view state; `hero.tsx`,
`digest-view.tsx`, `watchlist-table.tsx`, `discover-view.tsx`,
`trending-preview.tsx`, `symbol-detail.tsx` (the click-a-name detail modal),
`add-symbol.tsx`, `account-bar.tsx`, `staleness-pill.tsx`, `sparkline.tsx`,
`absence-chart.tsx`, `decomposition-bar.tsx`, `z-context-strip.tsx`,
`data-health-panel.tsx` (collapsed by default — for someone who goes looking,
not competing with the digest) are presentational. All client-rendered against
the API above — there's no server-rendered data path yet (a fine trade for a
cookie-scoped personal tool; see `DECISIONS.md`).

---

## Architecture

```
          ┌─────────────────────────────────────────┐
          │  ingest (cron)   poll union of symbols   │
          │  yahoo-finance2  →  bars_daily, quotes   │
          └───────────────┬─────────────────────────┘
                          │  once per symbol
                   ┌──────▼───────┐
                   │  detectors   │  pure functions, no DB
                   │  → events    │  shared across all users
                   └──────┬───────┘
                          │
   per user: 2 small tables (watermark + event state)
                          │
                   ┌──────▼───────┐
                   │ GET /api/digest │  one indexed query, capped at 5
                   └─────────────────┘
```

**The ingest tick** (`src/lib/ingest/tick.ts`, `npm run tick`, wired to Vercel
Cron via `vercel.json`) is the real thing, not a hand-run script:

- polls the **union of distinct watched symbols** — `selectDistinct` over
  `watchlist_items`, so poll cost is O(symbols), never O(users × symbols)
- **per-symbol failure isolation** — a dead ticker or a source timeout is
  logged and skipped; the run continues and that symbol keeps its
  last-known-good quote, which ages into "stale" on its own
- a **Postgres advisory lock** so two overlapping ticks can't collide (the
  second exits with `skipped`)
- **idempotent** — `onConflictDoNothing` on bars, `dedupe_key` on events
- the deployed demo leaves it **off** (`ENABLE_INGEST` unset) so the staged
  edge-case examples stay stable for a reviewer; it runs live where the flag
  is set, or locally with `npm run tick`

Detection is **per symbol, shared**. If 10,000 users watch RELIANCE we detect
once. Per-user cost is one row per watched symbol.

---

## Edge cases handled

All 13 from `SPEC.md` §9, in its order. "Unit tested" means there's an actual
test for it in `src/lib/**/*.test.ts` (38 cases total), not just a claim in
prose.

| Case | Handling |
|---|---|
| Splits & bonus issues | All return maths uses `adj_close`, never `close`. Unit tested: a 1:2 split fires no detector (a naive `close` check would read a −69% "crash"). |
| Circuit limits | `circuit_state` on the quote; the volume detector returns null when it isn't `none` (no two-way market → volume is meaningless). Unit tested, and **staged live in the seed**: `SUNPHARMA` is flagged `upper` — its volume detector genuinely produces zero events where every other symbol fires normally. |
| Insufficient history | `< 60` sessions → σ₆₀ is invalid → `detectSymbol` returns nothing, rather than firing on noise. Unit tested. |
| Market holidays & weekends | `nse-calendar.json` is the observed set of ^NSEI sessions, not `weekday ≠ 0/6`. Horizon is counted in sessions, never calendar days. Unit tested. |
| Very long absence | Horizon `h` clamped to 20 sessions so `√h` doesn't saturate and everything reads as significant. The digest card says "showing the last month" once the cap is hit. |
| Just-added symbol | No baseline for a move *since* you started watching — watermark = `added_at`. Rather than a blank digest, `buildDigest` falls back to a `lookback` set: the events the shared engine already flagged for those names in the last few weeks, labelled "nothing since — here's the recent history." The table row still says "watching from today." |
| Concurrent devices | Watermark advance is `GREATEST(existing, incoming)`, not last-write-wins — two devices can't rewind each other. |
| Clock skew | `classifyQuote()` rejects an `exchange_ts` in the future and falls back to `fetched_at`, so a misbehaving clock can't fake a "live" badge. |
| Duplicate cron runs | Idempotent via the `events.dedupe_key` unique constraint — verified by running `npm run detect` twice and diffing the row count (0 new). |
| Delisted / renamed symbol | `TATAMOTORS` demerged into TMPV/TMCV in 2025 — a real example, not staged. Kept in `symbols` with `is_active = false` and no bars; the table renders it at 50% opacity labelled "delisted" instead of crashing or silently vanishing. |
| Zero-volume session | Median/MAD volume baseline, guarded against `MAD = 0` (a constant-history-plus-one-spike case that would otherwise divide by zero). Unit tested. |
| 500-symbol watchlist | The digest caps at 5 headlines regardless of watchlist size — `slice(0, 5)` in `src/lib/digest.ts`, not a UI truncation. The cap is the product, not a limitation (spec §1). |
| Float precision | `numeric` columns throughout Postgres; prices and returns are strings at the ORM boundary, parsed once in the detector layer. No floats hold money. |

**Beyond the spec's list**, because the product's thesis (§1: "say less") extends to the failure states too:

| Case | Handling |
|---|---|
| Empty vs. quiet watchlist | Three different messages, never one generic empty state — "add a symbol" (`no_watchlist`), "nothing since you started — here's the recent history" (`not_watching_yet`, with a `lookback` set) and "quiet, nothing crossed the bar" (`all_quiet`). |
| Disputed / stale data | Amber is the palette's *only* use of that colour (spec §10) — always paired with the reason (lag, source, or circuit state), never a bare tint. Staged live: `INFY`'s quote is flagged disputed with an honest note (no live second source is configured). |
| No database on a fresh deploy | `/` is static and pings `/api/health`, which never throws — a cold Vercel deploy with no `DATABASE_URL` set still renders instead of 500ing. |
| A second source that's usually unavailable | `getFinnhubQuote()` is a real integration (spec §7) but NSE tickers mostly aren't on Finnhub's free tier — it's written to return `null` gracefully, which is the same "one source" path a missing key takes. Never a hard dependency. |
| The primary source fails mid-ingest | Each symbol's fetch is caught independently — a dead ticker or a yahoo timeout is logged into `failed[]` and the run continues; that symbol keeps its last-known-good quote, which ages into "stale" on its own. Verified by mixing a fake symbol into a real `npm run tick`. |
| Two ingest ticks overlapping | Postgres advisory lock — the second run exits with `skipped`, so a slow tick can't be lapped. Verified by running two concurrently. |
| A market with its own calendar | US bars are aligned to `^GSPC`'s own session set, never NSE's — NYSE holidays don't match NSE's, so borrowing the NSE calendar for a US symbol would misalign horizons. Each symbol's own `bars_daily` rows are the source of truth for its horizon; the shared calendar is only used for the header's approximate "away" stat. |
| A huge position with a trivial move | `positionBonus()` is capped and saturating (max 8 points on a 0–100 scale) — unit tested that a massive position with a barely-emitted event can never outrank a genuine signal in something held lightly. |

---

## What this deliberately doesn't do

Websockets, portfolio P&L, options, backtesting, full-page charts (the 4 cheap
ones above, not a trading terminal), push notifications, multiple watchlists.

**No broker OAuth, no Zerodha/Kite login, ever.** Identity is a 6-character
account code, not an auth provider — full stop, not "not yet." The product
never needs to know what you paid, what you hold at cost, or your account
value; the only broker-adjacent fact it uses is an optional position size
(shares/units, typed in, no credentials), and only to nudge ranking, bounded
so it can never override a real signal. A watchlist app that asked for
brokerage credentials to tell you a stock moved would be asking for more
trust than the job requires.

Real-time is polling with a visible "last updated". **LLM narration** is
explicitly out — `CLAUDE.md` bans it, on the reasoning that every number on a
card must trace back to the detector engine with nothing in between that could
hallucinate a percentage; template-composed copy (`card-copy.ts`) is the whole
narration layer, permanently. Naming the cuts is a stronger signal than hiding
them.

---

## Decisions

Non-obvious choices and their rejected alternatives are logged in
[`DECISIONS.md`](./DECISIONS.md). The submission pitch is
[`PITCH.md`](./PITCH.md).
