# Smart Market Watchlist

*Working title — final name TBD.*

A diff engine for your NSE watchlist. It answers one question: **what changed
since you last looked that actually matters, and why should you care?**

> **Status: Phase 2** — scaffold, schema, a live deploy, ~250 real NSE trading
> sessions committed to the repo, and the detector engine (18 unit tests). The
> digest API and UI land in Phases 3–5. See [`SPEC.md`](./SPEC.md).

**Live:** https://gww-ten.vercel.app

---

## Setup

Needs Node 20+ and Docker. **No API keys.**

```bash
git clone https://github.com/manuaishika/gww.git
cd gww
npm install
npm run setup     # Postgres + migrations + seed (~250 sessions of real NSE data) + detectors
npm run dev       # http://localhost:3000
npm test          # 18 detector / calendar unit tests, no DB needed
```

`npm run setup` also works against a remote database — set `DATABASE_URL` (e.g. a
free Neon instance) and it skips Docker.

The seed data (`src/lib/seed/bars.json`, ~670 KB) is committed, so the clone has
real data with **no API keys**. To regenerate it from source:
`node scripts/fetch-bars.mjs` (uses yahoo-finance2, which needs no key).

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
threshold in `config.ts`. One `computeSignals` pass feeds four detectors and the
scorer.

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

**Scoring** (§4.7) — `score = 100 · sigmoid(w_idio·|z_idio| + w_vol·max(0,
z_vol−1) + w_struct·flags)`. Events dedupe on `symbol:detector:date:floor(|z|)`
(re-running changes nothing; a real escalation crosses the floor and makes a new
row), and a `(symbol, detector)` pair can't re-fire within 3 sessions unless
`|z|` grew by ≥ 1.

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

Target list is `SPEC.md` §9; this table grows as cases are covered.

| Case | Handling |
|---|---|
| Delisted / renamed symbol | `TATAMOTORS` demerged in 2025 — kept in `symbols` with `is_active = false` and no bars, as a real example. Fetch returns nothing, no crash. |
| Splits & bonus issues | All return maths uses `adj_close`. Unit test: a 1:2 split fires no detector (a naive `close` check would see −69%). |
| Market holidays & weekends | `nse-calendar.json` is the observed set of ^NSEI sessions; horizon is counted in sessions, never calendar days. Unit tested. |
| Insufficient history | `< 60` sessions → σ₆₀ invalid → `detectSymbol` returns nothing. Unit tested. |
| Zero-volume / constant-volume session | MAD-based z, guarded against `MAD = 0`. Unit tested. |
| Circuit limits | `circuit_state` on the quote; the volume detector returns null when it's not `none`. Unit tested. |
| Very long absence | Horizon `h` clamped to 20 sessions so `√h` doesn't saturate. |
| Duplicate detector runs | Idempotent via `dedupe_key` unique constraint. `npm run detect` twice inserts nothing new. |
| Delisted / renamed symbol | `TATAMOTORS` demerged in 2025 — kept `is_active = false` with no bars. Fetch returns nothing, no crash. |
| Stale vs live quotes | Seed quotes stamped at their last session's close with `source = "seed"` — UI shows "as of close", not a fake "live". |
| No database on a fresh deploy | Landing page is static and pings `/api/health`, which never throws. |

---

## What this deliberately doesn't do

Websockets, OAuth, portfolio P&L, options, backtesting, full-page charts, push
notifications, multiple watchlists. Identity is a 6-character account code, not an
auth provider. Real-time is polling with a visible "last updated". Naming the cuts
is a stronger signal than hiding them.

---

## Decisions

Non-obvious choices and their rejected alternatives are logged in
[`DECISIONS.md`](./DECISIONS.md).
