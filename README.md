# Smart Market Watchlist

*Working title — final name TBD.*

A diff engine for your NSE watchlist. It answers one question: **what changed
since you last looked that actually matters, and why should you care?**

> **Status: Phase 5 submittable, plus most of 6–7.** Scaffold, schema, a live
> deploy, ~250 real NSE trading sessions, the detector engine — return z,
> idiosyncratic z, volume z, structural breaks, news density, silence, and
> sector-move clustering — with 30 unit tests, the full API, the UI, all 13
> edge cases from `SPEC.md` §9, a real (degrading) second-source integration +
> data health panel, and several detector examples staged against or found in
> real computed data. **Not built, on purpose:** LLM narration — `CLAUDE.md`
> bans it outright; see `DECISIONS.md`. See [`PITCH.md`](./PITCH.md) for the
> pitch, [`DECISIONS.md`](./DECISIONS.md) for the "why," including two real
> bugs found and fixed along the way (a cooldown gap, and a `detected_at`
> timestamp bug in the backfill that made "since you last checked" less exact
> than it looked).
>
> **Fastest way to see it populated:** open the app and click **Load the
> example** (account code `GRW-24X`).

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
npm test          # 30 detector / calendar / clustering unit tests, no DB needed
```

`npm run setup` also works against a remote database — set `DATABASE_URL` (e.g. a
free Neon instance) and it skips Docker.

The seed data (`src/lib/seed/bars.json`, ~670 KB, and `news.json`) is committed,
so the clone has real data with **no API keys**. Regenerate from source:
`node scripts/fetch-bars.mjs` (uses yahoo-finance2) and
`npx tsx scripts/generate-news.ts`. An optional `FINNHUB_API_KEY` (see
`.env.example`) enables a real second price source — the app is fully
functional without it.

---

## The thesis

A watchlist's job is not to show you prices. Groww already does that. The job is
to tell you what moved while you were away — and to be honest that a 3% day means
something different for every stock.

Three claims the product makes:

1. **Magnitude is not materiality.** Every change is normalised against the
   instrument's own recent volatility, not a fixed percentage threshold.
2. **"Since you last checked" is the only correct baseline** — not 24h, not
   today's open.
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
β₆₀      = cov(r_stock, r_nifty) / var(r_nifty)      over 60 sessions
residual = r_stock − β₆₀ · r_nifty
z_idio   = residual / (residσ₆₀ · √h)
```

A stock that rose because NIFTY rose is not news about the company. We subtract
`β₆₀ · r_nifty` and z-score what's left. The card shows the split:
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

---

## API

No UI yet — every route below is real and returns JSON.

| Route | What |
|---|---|
| `GET /api/session` | Who am I? Mints an account + httpOnly cookie on first visit. |
| `POST /api/session/adopt` | `{ code }` → adopt that account on this device (spec §6). |
| `GET /api/symbols/search?q=` | Local NSE symbol search. |
| `GET /api/watchlist` | Items with thesis, watermark, latest quote. |
| `POST /api/watchlist` | `{ symbol, thesis? }` → add. Watermark = now ("watching from today"). |
| `PATCH /api/watchlist/:symbol` | Edit thesis / mute. |
| `DELETE /api/watchlist/:symbol` | Remove. |
| `POST /api/seen` | `{ eventIds }` \| `{ symbol }` \| `{ all }` → advance the watermark. Never called on page load (spec §5). |
| `GET /api/digest` | The ranked digest — headlines (≤ 5, with the since-you-last-checked decomposition), a collapsed "N smaller changes", and the away-time header. |
| `GET /api/data-health` | Global, not per-user: which sources are configured, disputed quotes, circuit-locked symbols (spec §7, optional). |

`GET /api/digest` after adopting `GRW-24X`:

```json
{
  "awayDays": 36, "awaySessions": 25, "watching": 10,
  "headlines": [{
    "symbol": "ADANIENT", "detector": "idio_z", "z": -5.28, "score": 98.9,
    "thesis": "High-beta proxy for the group. In only for the volatility…",
    "sinceLastSeen": { "sessions": 25, "totalPct": -4.86, "marketPct": -2.21, "companyPct": -2.70 }
  }],
  "quieter": { "count": 19, "symbols": [{ "symbol": "COALINDIA", "count": 4 }] }
}
```

---

## The UI

One page, two views. Design follows spec §10 — the argument is *magnitude is
not meaning*, so the interface doesn't lead with colour:

- **Hero is the time gap** — "You were away 3 days," not a logo or a ticker grid.
- **No red/green as the primary channel.** Direction is a small ▲/▼ glyph;
  **size and weight encode materiality** — the top digest card is visibly
  larger and heavier than #5, which reads almost like a footnote.
- **Amber is reserved** for stale or disputed data only — nowhere else.
- **Card copy is templated**, not generated: `card-copy.ts` turns a detector's
  payload into one sentence (`"+4.1% total — 0.6% was the market, 3.5% was the
  company."`). No LLM (spec §8, `CLAUDE.md`).
- **Two empty states, not one** — an empty watchlist says what to do next; a
  quiet watchlist says nothing crossed the bar. Different messages, spec §10.
- **First run is a real choice, not a blank page** — a brand-new visitor sees
  "load the example" and "add your own first symbol," side by side, not an
  empty digest and a search box you have to go hunting for.

`src/components/app/` — `app-shell.tsx` owns data + view state; `digest-view.tsx`,
`watchlist-table.tsx`, `add-symbol.tsx`, `account-bar.tsx`, `staleness-pill.tsx`,
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

Detection is **per symbol, shared**. If 10,000 users watch RELIANCE we detect
once. Per-user cost is one row per watched symbol. Poll cost is O(distinct
symbols), not O(users × symbols).

---

## Edge cases handled

All 13 from `SPEC.md` §9, in its order. "Unit tested" means it's one of the
20 cases in `src/lib/detectors/detectors.test.ts` / `nse-calendar.test.ts`,
not just asserted in prose.

| Case | Handling |
|---|---|
| Splits & bonus issues | All return maths uses `adj_close`, never `close`. Unit tested: a 1:2 split fires no detector (a naive `close` check would read a −69% "crash"). |
| Circuit limits | `circuit_state` on the quote; the volume detector returns null when it isn't `none` (no two-way market → volume is meaningless). Unit tested, and **staged live in the seed**: `SUNPHARMA` is flagged `upper` — its volume detector genuinely produces zero events where every other symbol fires normally. |
| Insufficient history | `< 60` sessions → σ₆₀ is invalid → `detectSymbol` returns nothing, rather than firing on noise. Unit tested. |
| Market holidays & weekends | `nse-calendar.json` is the observed set of ^NSEI sessions, not `weekday ≠ 0/6`. Horizon is counted in sessions, never calendar days. Unit tested. |
| Very long absence | Horizon `h` clamped to 20 sessions so `√h` doesn't saturate and everything reads as significant. The digest card says "showing the last month" once the cap is hit. |
| Just-added symbol | No baseline — watermark = `added_at`. The digest is honestly empty for it until the next session; the table row says "watching from today." |
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
| Empty vs. quiet watchlist | Two different messages — "add a symbol" (`no_watchlist`) vs. "quiet, nothing crossed the bar" (`all_quiet`) — never one generic empty state. |
| Disputed / stale data | Amber is the palette's *only* use of that colour (spec §10) — always paired with the reason (lag, source, or circuit state), never a bare tint. Staged live: `INFY`'s quote is flagged disputed with an honest note (no live second source is configured). |
| No database on a fresh deploy | `/` is static and pings `/api/health`, which never throws — a cold Vercel deploy with no `DATABASE_URL` set still renders instead of 500ing. |
| A second source that's usually unavailable | `getFinnhubQuote()` is a real integration (spec §7) but NSE tickers mostly aren't on Finnhub's free tier — it's written to return `null` gracefully, which is the same "one source" path a missing key takes. Never a hard dependency. |

---

## What this deliberately doesn't do

Websockets, OAuth, portfolio P&L, options, backtesting, full-page charts, push
notifications, multiple watchlists. Identity is a 6-character account code, not an
auth provider. Real-time is polling with a visible "last updated". **LLM
narration** is explicitly out — `CLAUDE.md` bans it, on the reasoning that every
number on a card must trace back to the detector engine with nothing in
between that could hallucinate a percentage; template-composed copy
(`card-copy.ts`) is the whole narration layer, permanently. Naming the cuts is
a stronger signal than hiding them.

---

## Decisions

Non-obvious choices and their rejected alternatives are logged in
[`DECISIONS.md`](./DECISIONS.md). The submission pitch is
[`PITCH.md`](./PITCH.md).
