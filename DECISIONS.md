# Decisions

One entry per non-obvious choice: what was picked, what was rejected, why.
Appended as decisions are made, not reconstructed at the end.

---

### Product name — deferred

Working title in code and config is "Smart Market Watchlist" (`SPEC.md` uses
"Delta" in its pitch draft). The final name is not chosen yet; it will be made
consistent across the repo, README and pitch before submission.

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
