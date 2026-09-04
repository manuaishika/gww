# Decisions

One entry per non-obvious choice: what was picked, what was rejected, why.
Appended as decisions are made, not reconstructed at the end.

---

### Symbol search is scoped to the seeded universe, not live Yahoo search

`/api/symbols/search` queries the local `symbols` table only. It could instead
call `yahoo-finance2`'s `search()` and let anyone add any NSE ticker — but a
freshly-added real symbol would have zero bars in our DB, "insufficient
history" would fire on *every* one of them, and the app's "no keys, no
network, works from a clean clone" guarantee would quietly depend on a live
external call the moment someone typed in the search box. Scoping to the 30
seeded symbols keeps that guarantee absolute. Trade-off, named on purpose: you
can't watch a symbol outside the seed set in this build.

---

### One symbol is a staged circuit-limit example

`scripts/seed.ts` sets `SUNPHARMA`'s `circuit_state` to `upper` after seeding
quotes. We have no live feed to hit a real circuit with (that needs Phase 6),
and circuit handling is a named, very-India-specific edge case (spec §9) that
almost nobody else will demonstrate — better to show it working than describe
it. The volume detector genuinely suppresses itself for that symbol (verified:
0 `volume_z` events for SUNPHARMA after this went in, vs. others firing
normally); this isn't a UI-only mock.

---

### The UI is entirely client-rendered, no server-side data fetch on `/`

`app-shell.tsx` fetches `/api/digest` + `/api/watchlist` on mount rather than
the page doing an RSC data fetch. Simpler (one data-fetching pattern, not two)
and correct for this app's actual constraint — the httpOnly session cookie
means the page can't know who's asking until a request carries it, and this is
a personal tool behind a cookie, not a page that needs to rank in search.
Trade-off: a bare loading flash before the digest appears, and no SSR/SEO story.
Would revisit for a public marketing page, not for this.

---

### Headline % is "since you checked", not "on the day it fired"

`headlinePct()` prefers `sinceLastSeen.totalPct` over the event's own
`payload.totalPct`. The persisted event describes one session (spec §4's
baseline is the prior session); the card's big number should answer the
product's actual question — spec §1's "what changed since you last looked" —
so it uses the digest's separately-computed since-watermark decomposition
instead. The why-line underneath still quotes the specific session's move,
so both numbers are visible and neither contradicts the other.

---

### Card copy composes from the payload with template functions, not JSX ternaries scattered across the component

`card-copy.ts` (`whyLine`, `headlinePct`) is pure and detector-keyed, tested by
inspection rather than unit tests (no time budget for UI-string tests, and
`CLAUDE.md` explicitly says not to). Keeping it out of `digest-view.tsx` means
the copy logic reads as one file instead of four inline branches.

---

### One event per (symbol, session), not one per detector

Built it the other way first (spec §3's `events.detector` column reads as "one
row per detector") and it produced ~356 events over 45 sessions with every
score pinned near 100 — a genuine multi-signal day fired 3-4 rows, and the
spec's `100·sigmoid(Σ wᵢzᵢ)` saturates once any real signal clears its
threshold. Rebuilt so `detectSymbol` composes ONE event per session: the
dominant signal (idiosyncratic wins when it fires — it's "the one that
matters", §4.2) headlines it, but `signals` on the row carries every computed
fact (return z, idio z, volume z, structural flags, the decomposition), which
is what the card needs anyway (§8). Cut event volume ~35% and made scores
discriminate (demo account now spans 93–99, not five 100s). `dedupeKey` and
cooldown are per-symbol accordingly, not per-(symbol, detector).

---

### Score weights are calibrated, not the spec's literal 1.0/0.35/0.6/0.5

Same formula, different weights (`config.ts`): `w_idio 0.5, w_ret 0.28, w_vol
0.16, w_struct 0.32`, plus a cap on the volume term so one freak print (a
12x-volume session can hit z=29) can't single-handedly saturate the sigmoid.
At the original weights every event that cleared its threshold scored 95-100 —
technically ranked correctly but visually useless ("why do all five cards say
100?"). These weights put a lone 2σ idio move at ~73 and a stacked 5σ +
volume + structural day at ~99, so score reads as materiality, not a boolean.
Tunable — this is what Phase 8's sensitivity dial multiplies.

---

### The digest computes its own "since you last checked" decomposition

Persisted events describe one session (baseline = the prior session, h≈1). The
digest additionally recomputes the idio decomposition with `horizonSessions =
sessionsBetween(watermark, latest)` (capped at 20, spec §9) so the card's
headline number matches "since you last checked", not "on the day it fired." Reuses
`computeSignals` — no new maths, a different horizon.

---

### Identity: httpOnly cookie holds a bare user_id, no signing

The cookie is the whole credential; knowing it is equivalent to knowing the
6-char account code, which is the explicit design (spec §6) — either one gets
you the watchlist. No session token, no JWT. Simplest thing that satisfies "no
OAuth, cross-device in one text field."

---

### `GRW-24X`: a seeded demo account, not a fixture-only test

`scripts/seed-demo.ts` both seeds a populated example account (for a judge with
no UI to click through) and doubles as the digest smoke test — asserts
headlines are ranked, ≤ 5, and non-zero. One script, two jobs, wired into
`npm run setup` so it runs on every clean clone.

---

### Detectors are pure; the engine is the only impure layer

`src/lib/detectors/**` has no DB import, no `Date.now()`, no config literals
inside functions (everything numeric is in `config.ts`). Each detector is
`(ctx, signals) => Event | null`. `src/lib/detect-run.ts` is the sole place that
reads bars, writes `events`/`stats_daily`, and stamps timestamps. This is what
makes the maths testable in milliseconds (14 unit tests, no DB) — and it's the
thing the judges will poke at, so it stays clean.

---

### One `computeSignals` pass feeds all four detectors + the scorer

Rather than each detector re-deriving returns/beta/volume from bars, `signals.ts`
does one pass and the detectors read from it. Keeps each detector a few lines and
guarantees the scorer sees the same numbers the detectors did.

---

### Volume baseline excludes the current session

`vol_median_30` / `vol_mad_30` are computed over the 30 sessions *before* the one
being evaluated. Including the current bar lets a single spike sit at its own
median and collapse the MAD to zero (a constant history + one spike → MAD 0 →
divide-by-zero). Trailing baseline is also just the correct question: "is today
unusual versus what came before."

---

### dedupe key is a readable composite, not a hash

`symbol:session_date:floor(|z|)` instead of `hash(...)`. Same idempotency (a
unique constraint does the work; an escalation from z 2.1→3.4 crosses the floor
and makes a new row), but you can read it in `psql` and know exactly which
event it is. (One key per session now, not per detector — see "one event per
symbol-session" below.)

---

### Detection backfill holds stats fixed "as of latest"

`scripts/detect.ts` walks the last N sessions but uses one `stats_daily` snapshot
rather than recomputing σ/β as of each historical session. Cheaper, and the
error is small over ~45 sessions. The live cron (Phase 3+) recomputes stats each
session, where it matters.

---

### Betas come out textbook-correct — a good smoke test

From seed data: BAJFINANCE β≈1.6 (high-beta NBFC), BHARTIARTL β≈0.7 and DRREDDY
β≈0.3 (defensives), COALINDIA β≈0 (commodity). `resid_sigma < sigma` for every
symbol. Not asserted in tests but eyeballed after every seed refresh.

---

### Seed data: real NSE bars, committed as JSON

`scripts/fetch-bars.mjs` pulls ~250 real trading sessions for the 30 equities +
NIFTY from yahoo-finance2 and writes `src/lib/seed/bars.json` (~670 KB). The
seed script loads that file — **no network, no keys** on a clean clone. The
fetch script is committed too, so the provenance of the dataset is auditable and
anyone can regenerate it. Rejected: a synthetic price generator (less
defensible, and real data already contains real holidays, real splits via
`adj_close`, and real volume spikes for the detectors to find); rejected: hitting
the API at setup time (fails offline, rate-limited, non-deterministic).

---

### yahoo-finance2 v4, not v2

The spec assumed v2; v2 reached end-of-life in 2025. v4 is the maintained line.
API change: `new YahooFinance()` instead of a default singleton. No other impact.

---

### TATAMOTORS kept in the universe as a delisted example

Tata Motors demerged into TMPV / TMCV in 2025 and the `TATAMOTORS` line stopped
trading. Rather than quietly dropping it, it stays in `symbols` with
`is_active = false` and no bars — a real, un-staged instance of the
delisted/renamed edge case (spec §9). M&M was added to keep 30 active equities.

---

### The session calendar is observed, not computed

`src/lib/seed/nse-calendar.json` is the set of dates ^NSEI actually traded.
`sessionsBetween()` counts membership in that set. No `weekday !== 0` assumption
anywhere — NSE has ~14 holidays a year and the odd weekend special session
(spec §9).

---

### Seeded quotes are stamped "at close", not "live"

Each seed quote's `exchange_ts` is its last session's 15:30 IST close and
`source = "seed"`. The staleness UI (spec §7) will render "as of close, <date>"
rather than a fake "live" badge. Honest by construction.

---

### Product name — deferred

Working title in code and config is "Smart Market Watchlist" (`SPEC.md` uses
"Delta" in its pitch draft). The final name is not chosen yet; it will be made
consistent across the repo, README and pitch before submission.

---

### Deploy: Vercel + Neon, deployed at the start of Phase 0

Live at https://gww-ten.vercel.app from the first commit, per spec §12 rule 1 ("a
deploy that breaks the night before is the most common way to lose one of
these"). Neon holds the production database; local reviewers use the committed
docker-compose Postgres instead and never touch Neon.

---

### Phase 0 landing page does not depend on the database

The `/` route is static; a client component pings `/api/health`, which catches
its own errors and always returns 200. So the deployed URL renders even before
`DATABASE_URL` is set on Vercel. Rejected: server-rendering a symbol count on
`/`, which would 500 the whole page on a cold deploy — the exact "broke the night
before" failure the spec warns about.

---

### Postgres driver: `postgres` (postgres.js), not `pg`

Drizzle supports both. `postgres.js` is a single small dependency, has first-class
Neon support, and its tagged-template API keeps raw SQL readable. `pg` pulls more
and needs a pool wrapper. TLS is on for anything that isn't `localhost` (Neon
requires it; local docker rejects it).

---

### `npm run setup` orchestrates docker + migrate + seed in one script

Rather than documenting three commands in the README, `scripts/setup.mjs` runs
them and fails loudly with a fix if Docker is down. If `DATABASE_URL` is remote it
skips docker entirely, so the same command works against Neon.

---

### Tailwind v3, not v4

v4 is newer and its shadcn integration is still settling. v3.4 + shadcn is
well-trodden and the spec values "simple to defend" over "current". Revisit only
if something forces it.

---

### `is_active` on `symbols` (not in the spec's §3 sketch)

Spec §9 requires a delisted/renamed symbol to stay in a watchlist marked inactive
without crashing. That needs a flag somewhere; `symbols.is_active` is the cheapest
place. Watchlist items reference it and render dimmed when false.
