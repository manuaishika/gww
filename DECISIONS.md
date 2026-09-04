# Decisions

One entry per non-obvious choice: what was picked, what was rejected, why.
Appended as decisions are made, not reconstructed at the end.

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
