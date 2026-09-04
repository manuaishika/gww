# Smart Market Watchlist

*Working title — final name TBD.*

A diff engine for your NSE watchlist. It answers one question: **what changed
since you last looked that actually matters, and why should you care?**

> **Status: Phase 1** — scaffold, schema, a live deploy, and ~250 real NSE
> trading sessions committed to the repo. The detector engine and digest UI
> land in Phases 2–5. See [`SPEC.md`](./SPEC.md).

**Live:** https://gww-ten.vercel.app

---

## Setup

Needs Node 20+ and Docker. **No API keys.**

```bash
git clone https://github.com/manuaishika/gww.git
cd gww
npm install
npm run setup     # starts Postgres, runs migrations, seeds ~250 sessions of real NSE data
npm run dev       # http://localhost:3000
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

_(Full derivation lands with the detector engine in Phase 2. Summary:)_

- **Return z-score** — `z = ln(price_now / price_last_seen) / (σ₆₀ · √h)`, where
  `σ₆₀` is the stdev of daily log returns over 60 sessions and `h` is trading
  sessions elapsed. "How many standard deviations is this move, for this stock,
  over this many days?"
- **Idiosyncratic move** — strip out the market: `residual = r_stock − β₆₀ ·
  r_nifty`, then z-score the residual. A stock rising with NIFTY isn't news about
  the company; the residual is.
- **Volume anomaly** — median/MAD, not mean/stdev, because one results day
  poisons a mean.

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

_(Populated as they're implemented — target list is `SPEC.md` §9.)_

| Case | Handling |
|---|---|
| Delisted / renamed symbol | `TATAMOTORS` demerged in 2025 — kept in `symbols` with `is_active = false` and no bars, as a real example. Fetch returns nothing, no crash. |
| Splits & bonus issues | Bars carry both `close` and `adj_close`; all return maths (Phase 2) uses `adj_close`. |
| Market holidays & weekends | `nse-calendar.json` is the observed set of ^NSEI sessions; `sessionsBetween()` counts membership, never `weekday`. |
| Stale vs live quotes | Seed quotes are stamped at their last session's close with `source = "seed"` — the UI will show "as of close", not a fake "live". |
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
