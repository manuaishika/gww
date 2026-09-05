# Decisions

One entry per non-obvious choice: what was picked, what was rejected, why.
Appended as decisions are made, not reconstructed at the end.

---

### The ingest tick — one code path, overlap-safe, failure-isolated

`src/lib/ingest/tick.ts` is the backbone under the digest. `runTick()`:

- takes a **Postgres advisory lock** (`pg_try_advisory_lock`) — if a previous
  run is still going, this one exits with `skipped`, so a slow tick can't be
  lapped by the next scheduled one. Verified by running two concurrently: one
  ran, the other skipped cleanly.
- polls the **union of distinct watched symbols** (+ their benchmarks) —
  `selectDistinct` over `watchlist_items`, so cost is O(symbols), never
  O(users × symbols). This is the concrete answer to "how does it scale."
- **isolates per-symbol failure**: a bogus ticker or a yahoo timeout for one
  symbol is caught, logged into `failed[]`, and the run continues. That
  symbol keeps serving its last-known-good quote, which ages into "stale" on
  its own via `exchange_ts` — no fake "just refreshed" stamp. Verified by
  mixing a fake symbol into a real run.
- is **idempotent**: `onConflictDoNothing` on bars, `dedupe_key` on events —
  re-running inserts nothing new.

`/api/cron/tick` wires it to Vercel Cron (`vercel.json`, weekday close).
Guarded by `CRON_SECRET` (Vercel sends it) and `ENABLE_INGEST` — the deployed
demo leaves ingest **off** so its staged edge-case examples (circuit lock,
disputed quote) stay put for a reviewer; the code is real and runs live in a
deployment that sets the flag, or locally via `npm run tick`.

---

### Race conditions and integrity, stated plainly

- **Two devices advancing the same watermark**: `GREATEST(existing, incoming)`,
  not last-write-wins — neither can rewind the other.
- **Two ingest ticks overlapping**: advisory lock, above.
- **A digest read during a detection write**: the reader can briefly see a
  partial event set. Acceptable — events are additive (nothing is deleted
  mid-run in the incremental path), the digest caps at 5 and re-reads on the
  next poll, and nothing here is money. A shadow-table-and-swap would remove
  even that flicker; it's noted, not built, because the cost isn't worth it
  for a watchlist.
- **Account minting**: `getOrCreateUser()` runs on every API call and there's
  no per-IP rate limit — a hostile client could mint many empty users. Each
  is two tiny rows and no PII; the real fix is a rate limiter at the edge
  (Vercel / a middleware), out of scope for the submission but named here.

---

### The digest is never empty of substance the moment you start watching

Real complaint: "my watchlist is there but the digest shows nothing." Correct
behaviour — a symbol added five minutes ago has a watermark of "now," so
nothing's happened *since* — but it reads as broken. `buildDigest` now returns
a `lookback` set when `headlines` is empty: the top event per watched symbol
regardless of watermark, shown under "you just started watching these — here's
what the engine flagged for them in the last few weeks." Clearly labelled as
pre-watching history, not a live diff. `emptyReason: "not_watching_yet"`.

---

### Discover is a real tab, not just the first-run screen

The trending preview only rendered when `watching === 0`, so anyone with a
watchlist never saw it — and there was no way back to it. Now a third tab
(Discover) alongside Digest / Table, always there: the trending list plus
browse-by-sector (`/api/universe`, sectors → companies, "+ watch" / "remove"
inline). The search box also grew a dropdown on empty focus — recently added
(localStorage) and notable-this-week (from `/api/trending`).

---

### Cross-device sync is a QR code, not a remembered string

"How do I know which device, do I have to remember the code" — fair. Real
email verification needs an email provider (an API key), which breaks the
no-keys guarantee. The QR does it with zero external dependency: the account
bar renders a QR of `<origin>/?sync=<code>`; scan it with a phone camera and
the app opens already synced (AppShell reads `?sync=` on load, adopts, strips
the param). Typing the code is still there, folded into a `<details>`. The
placeholder was `K7M-2QX` — spec's own example — which read as a real code to
try; it's now generic, and your own code is a copy-to-clipboard button.

---

### The first screen shows real data, not just buttons

The first-run fix (two options: load the demo, or add your own) was still two
empty-feeling boxes with no actual market content until you clicked one of
them. `GET /api/trending` (`src/lib/trending.ts`) is a global, un-personalized
read of the same `events` table the digest reads — the detector engine's
actual, real, current output across the whole universe, ranked by score, one
per symbol, no session or watchlist required. Shown above the two boxes with
a one-click "+ watch" per item. Costs nothing extra: events are already
shared across every user (the scaling story), so this is the same data, a
different filter. Directly answers "if I don't pick something it's a blank
screen" — now the first thing on screen, always, is proof the engine works.

---

### No broker OAuth — a design conclusion, not a missing feature

Asked directly: "what's the point without logging into Zerodha/Kite?" The
product's actual job is telling you what changed and whether it matters — it
never needs your holdings, cost basis, or account value to do that. Position
size (below) is the one broker-adjacent fact it uses, and it's a typed-in
number, not a credential. Adding OAuth would mean asking for far more trust
(read access to a real brokerage account) than the job justifies, for a
feature (ranking nudge) that a plain number already solves. This isn't new —
CLAUDE.md and spec §11 already said no OAuth — but it's worth stating as a
conclusion, not just a constraint someone handed down.

---

### Position size: a bounded ranking nudge, computed at read time, never stored on the event

"A 3-sigma move in something you barely hold shouldn't outrank nothing" — but
it also must never let a huge, barely-moving position outrank a real signal
in something small. `positionBonus()` is a saturating function (`8 ·
size/(size+100)`), capped well below what any score gap between a real event
and noise would be. Computed in `buildDigest()` at read time from
`watchlist_items.position_size` (per-user), applied only to this user's
ranking — never written to the shared `events.score` column, which stays
identical for every user watching that symbol (the scaling story: detection
is shared, only preference is personal). Unit tested that it can never invert
a real ordering, only break near-ties.

---

### Multi-market: per-symbol columns, each market's own calendar, no conversion

`currency`, `exchange`, `timezone`, `benchmark_symbol` live on `symbols`, not
as app-wide constants — proven with a second real market (3 US stocks + S&P
500, real Yahoo data), not just a schema that could theoretically support one.
Two decisions inside this:
- **US bars are aligned to `^GSPC`'s own session set**, not NSE's — NYSE
  holidays don't match NSE's (e.g. July 4th is an NSE trading day and a US
  holiday; Diwali is the reverse). Forcing US bars onto the NSE calendar would
  silently misalign every horizon calculation for US symbols.
- **No currency conversion, anywhere, ever.** A z-score is dimensionless by
  construction — `(AAPL's move in USD) / (AAPL's own USD volatility)` and
  `(RELIANCE's move in INR) / (RELIANCE's own INR volatility)` are both just
  "standard deviations," directly comparable with no FX rate touched. Only
  the raw-price *display* needs the symbol's currency (`$` vs `₹`); the
  entire detector engine is unaware currency exists.

The one honest approximation: the digest header's `awaySessions` stat still
uses the NSE calendar for everyone (a vanity summary number, spec's own
"away" framing), while every per-symbol calculation (`decompose()`'s horizon)
already counted sessions from that symbol's own `bars_daily` rows, not the
shared calendar — so it was already correct for US symbols before this was
even a design question.

---

### Charts are hand-rolled inline SVG, not Recharts

The original stack decision (`SPEC.md` §2) named Recharts for sparklines.
Once the ask grew to 4 chart types across digest cards and the table, a
hand-rolled `<svg>` per chart (`sparkline.tsx`, `absence-chart.tsx`,
`decomposition-bar.tsx`, `z-context-strip.tsx`) won out: no new dependency,
full control over the palette (spec §10's five colours, no library defaults
leaking in), and each one is genuinely a few line segments or dots — not
enough complexity to justify ~90KB of library for. Deviates from the original
plan; logged rather than silently swapped.

---

### Sector clustering: the one-factor model's honest blind spot

`idio_z` strips out NIFTY, not the sector — it's a single-factor model
(market only), the same simplification CAPM makes before Fama-French adds
size/value factors. If ≥3 watched symbols in the SAME sector fire `idio_z` on
the SAME session, that isn't 3 independent company stories; it's a sector-wide
factor the model can't separate from true company-specific news, and
presenting all 3 as separately "company-specific" would overclaim precision
the model doesn't have. `src/lib/sector-cluster.ts` groups these (pure, unit
tested — 5 cases including the exact real example below) and the digest
collapses them into one card naming the others, instead of letting a single
sector event eat multiple of the 5 headline slots.

**Real example, not fabricated**: scanning the full ~250-session seed history
(`npm run detect -- 220`) surfaces `TCS`, `INFY`, `WIPRO`, `HCLTECH` all firing
`idio_z` on **2026-02-12** — a genuine same-day, same-sector quadruple in
unmodified NSE data, almost certainly an IT-sector-wide move (currency, rate
guidance, or similar). It's outside the default 45-session operational window
and the demo account's realistic ~25-session absence, so it won't appear live
in `GRW-24X` — forcing it in would mean either an unrealistic year-long demo
watermark (fighting the very-long-absence cap that exists for a reason) or
fabricating price data to recreate it recently, and both are worse than
proving the mechanism at the unit level against the real event and saying so
here. Reproduce it directly: `npm run detect -- 220` then
`select session_date, count(*), array_agg(symbol) from events e join symbols s
using (symbol) where detector='idio_z' group by 1 having count(*) >= 3`.

---

### `detected_at` for backfilled events must be the session's close, not "now"

Real bug, found while trying to verify the sector cluster above end-to-end.
Spec §5 says the digest reads `events where detected_at > last_seen_at`. In a
live system `detected_at` ≈ when the daily cron ran, so it naturally tracks
"did this happen after I last checked." But the seed data is backfilled in one
batch — every historical row was originally stamped `detected_at = new
Date()`, i.e. the moment `npm run detect` happened to run, regardless of which
of the last 45 sessions it was actually from. Every row looked "just
detected," so the "since watermark" filter was accidentally permissive —
correct-looking only because the `events` table itself was bounded to a
45-session backfill window, not because the filter was doing real work. A
watermark set anywhere inside that window would have shown the *entire*
window as unread, not just what came after it. Fixed in `detect-run.ts`:
backfilled rows now get `detected_at` = their session's real close time
(15:30 IST). Visible effect on the same seed: the demo account's "quieter"
count dropped from 53 to 19 once the filter started doing real work instead
of passing everything through.

---

### Cooldown had a real bug: it only checked the DB, not the batch it was in

Found running the news/silence detectors: on a first-ever backfill, the "same
symbol fired recently, suppress unless |z| grew" check queried `events` in the
DB *before* the batch started — which is empty on the first run, so nothing
was ever suppressed within a batch. Harmless-looking for return/idio (they
rarely repeat on adjacent quiet days), but `silence` exposed it badly: it fired
on nearly every quiet session for 5-8 sessions in a row after a single results
date. Fixed in `detect-run.ts` — candidates are now walked in session order
and each *kept* one feeds the cooldown window for the next, so it's correct on
a first backfill and an incremental one. Effect: total events dropped from 272
to 157 on the same seed, and `silence` now fires once per quiet streak instead
of every day of it. Logged here because it's exactly the kind of bug "resilience
and edge cases" is supposed to catch, and it was originally missed.

---

### News/silence detectors are staged on real dates, not real news

No live news feed is wired up (see the search-scoping entry below — same
reasoning: a key would break the no-keys guarantee). `scripts/generate-news.ts`
writes a small illustrative "results calendar" — one deterministic date per
symbol, clearly not a real filing calendar — plus two examples placed against
REAL computed signals, checked by hand before committing them: NESTLEIND's
idiosyncratic move on 2026-08-27 is ~0.002σ (about as quiet as this dataset
gets) with a staged results date 7 days earlier, so the silence detector fires
on real price data, not a fabricated one; WIPRO's 2026-09-03 session has every
OTHER detector quiet (checked: |z_ret|, |z_idio|, |z_vol| all < 1, no
structural flags), with two staged headlines in the preceding week, so
news-density is the only thing that fires that day. Both are unit tested
independent of the seed (`detectors.test.ts`), and both are also verifiable
live in the seeded DB — this isn't a UI-only mock, same pattern as the
circuit-limit and disputed-quote examples.

---

### The 100-word pitch and the LLM narration boundary

`CLAUDE.md` bans LLM calls in this codebase outright — not an oversight, a
decision, because every number on a card has to trace back to the detector
engine with nothing in between that could hallucinate a percentage. Phase 8
lists "LLM narration" as upside; it was not built, on purpose, even after
being asked to "complete all phases." Template-composed copy
(`card-copy.ts`) is the whole narration layer, and it stays that way.

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

### Finnhub is a real integration with an expected-null result, plus one staged dispute

`src/lib/ingest/finnhub.ts` and `reconcile.ts` are written against Finnhub's
real API shape and would work if `FINNHUB_API_KEY` were set — but NSE tickers
mostly aren't on Finnhub's free tier, so in practice `getFinnhubQuote()`
returns `null` even with a key, which is exactly the "app works with one
source" path the code already has to handle (spec §7). Rather than leave the
disputed-data UI completely unexercised, `INFY`'s quote is flagged
`is_disputed = true` with a `dispute_note` that says outright it's staged and
why — same honesty standard as the circuit example, not dressed up as a real
disagreement between two live feeds.

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
