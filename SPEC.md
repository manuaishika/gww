# Delta — Smart Market Watchlist

**Code, by Groww. Solo build. Submission closes 7 Sep, 11:00 IST.**

Built in phases. Each phase ends at a point where the project is still
submittable. Stop whenever you need to.

*(Rename the product if you like — but pick a name and use it consistently in the
repo, the README and the pitch.)*

---

## 0. What the judges actually asked for

From the FAQ, verbatim in effect:

- **Source code** (Git repo) with a **README containing clear setup instructions**
- **A 100-word product pitch** — what you built, how you designed it, the thinking
  behind key choices
- **Something that actually works**

**There is no demo video requirement.** That frees up real time. It also shifts
weight onto the repo itself, because the repo is the submission.

Stated evaluation criteria: *engineering depth, problem interpretation, resilience
and edge cases, code quality, simplicity, originality of thought.* Explicitly **not**
feature count.

Two consequences that shape everything below:

1. **A judge must be able to run this from a clean clone with no API keys.** If it
   needs a Neon URL and a Finnhub key, some fraction of reviewers won't bother.
   Seed data ships in the repo. `docker compose up` or `npm run setup` and it works.
2. **"Resilience and edge cases" is a named criterion.** Most submissions will
   handle none. Handling them *and documenting them* is the cheapest differentiation
   available. See §9.

Later rounds are Top 40 virtual presentations, then Top 20 at Groww HQ, where the
question shifts to *"do you really understand what you built?"* So: **do not ship
maths you can't derive on a whiteboard.** Everything in §4 is chosen partly because
it's explainable in one sentence.

---

## 1. The thesis

A watchlist's job is not to show you prices. Groww already does that, better than
we will.

The job is to answer one question when you come back after being away:

> **What changed that actually matters, and why should I care?**

Everything follows from that. The product is a **diff engine** with a reading
surface on top. The price table exists, but it's the secondary view.

Three claims we're making, and must be able to defend:

1. **Magnitude is not materiality.** A 3% move in ITC is an event. A 3% move in a
   smallcap is Tuesday. We normalise every change against the instrument's own
   recent behaviour, not a fixed threshold.
2. **"Since you last checked" is the only correct baseline.** Not 24h, not today's
   open. A user who's been away nine days does not care about today.
3. **The product's job is to say less.** A watchlist that surfaces everything has
   surfaced nothing.

These map onto Groww's own stated values without straining — *Keeping It Simple*
(a capped digest, not a firehose), *Being Transparent* (every number carries its
source and age), *Reliability, Always* (degrades to one source, to templates, to
last-known-good). Worth one line in the README. Don't lay it on thick.

**India-first.** NSE symbols, ₹, IST, NIFTY 50 as the market index, Indian market
hours and holidays, circuit limits. Not a US app with rupees pasted on.

---

## 2. Stack (decided — don't re-litigate)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15, App Router, TypeScript** | One repo, one deploy, API routes are the backend. No CORS, no second service. |
| DB | **Postgres 16** via `docker-compose` locally, Neon for the deploy | One command for a reviewer. Same engine both places. |
| ORM | **Drizzle** | Typed, migrations in one command, readable SQL. |
| UI | **Tailwind + shadcn/ui** | Good primitives immediately. |
| Charts | **Recharts**, sparklines only | Anything heavier is a time sink. |
| Market data | **`yahoo-finance2`** | No API key. NSE via `.NS` suffix (`RELIANCE.NS`, `TITAN.NS`). Gives daily bars, quotes, search, news. |
| Second source | **Finnhub** free tier — *optional* | Only exists to produce disagreements for §7. App must work without it. |
| Index | `^NSEI` (NIFTY 50) | Beta and residuals are computed against it. |
| Scheduling | `/api/cron/tick`, Vercel Cron in prod, a dev script locally | Zero infra. |
| Identity | **Account code** (§6) | No OAuth. Cross-device in one text field. |
| Deploy | **Vercel** | Deploy early, not the night before. |

**Hard constraint: `git clone && npm run setup && npm run dev` must produce a
working app with data, no keys, no signup.** Commit the seed dataset. Everything
requiring a key is optional and degrades silently.

---

## 3. Data model

```sql
users(id uuid pk, account_code text unique, created_at)

symbols(symbol text pk, name text, exchange text, sector text, listed_on date)

watchlist_items(
  id uuid pk, user_id uuid, symbol text,
  added_at timestamptz,
  thesis text,                 -- "why am I watching this" — §8
  muted_until timestamptz,
  unique(user_id, symbol)
)

-- market data: shared across all users. This is the scaling story.
bars_daily(symbol, session_date date, open, high, low, close,
           adj_close, volume, pk(symbol, session_date))

quotes_latest(
  symbol text pk, price numeric, prev_close numeric,
  exchange_ts timestamptz,      -- when the exchange says it happened
  fetched_at timestamptz,       -- when we pulled it
  source text,
  is_disputed boolean, dispute_note text,
  circuit_state text            -- 'none' | 'upper' | 'lower' — §9
)

stats_daily(                    -- precomputed once per session
  symbol text pk, sigma_60, beta_60, resid_sigma_60,
  vol_median_30, vol_mad_30, high_252, low_252,
  sessions_available int,       -- for the insufficient-history guard
  computed_at timestamptz
)

events(
  id uuid pk, symbol text, detector text,
  session_date date, dedupe_key text unique,
  score numeric, z numeric, payload jsonb,
  detected_at timestamptz
)

user_symbol_state(user_id, symbol, last_seen_at, last_seen_price,
                  pk(user_id, symbol))
user_event_state(user_id, event_id, status, acted_at)
```

The split that matters: **events are per-symbol and shared**. If 10,000 users watch
RELIANCE, we detect once. Per-user state is two columns. Say this out loud when
they ask about scale.

---

## 4. The detector engine

The core of the project. Build and test this **before any UI**.

Every weight and threshold lives in `lib/detectors/config.ts`. Nothing numeric is
hardcoded inside a detector.

### 4.1 Return z-score

```
r       = ln(price_now / price_at_last_seen)
h       = trading sessions elapsed since last_seen (min 0.25 intraday)
sigma_h = sigma_60 * sqrt(h)      -- sigma_60 = stdev of daily log returns, 60 sessions
z_ret   = r / sigma_h
```

`|z| >= 2` notable, `>= 3` strong. This one formula is the answer to "what counts
as meaningful." You should be able to say it in a sentence: *how many standard
deviations is this move, for this stock, over this many days?*

### 4.2 Idiosyncratic move — the one that matters

A stock rising because NIFTY rose is not news about that stock.

```
beta_60  = cov(r_stock, r_nifty) / var(r_nifty)      -- 60 sessions
residual = r_stock - beta_60 * r_nifty               -- over horizon h
z_idio   = residual / (resid_sigma_60 * sqrt(h))
```

Rank on `z_idio`. Show the decomposition in the card:
*"+4.1% total — 0.6% was the market, 3.5% was the company."*

### 4.3 Volume anomaly

Median and MAD, not mean and stdev — volume has fat tails and one results day
poisons a mean.

```
z_vol = (volume_today - vol_median_30) / (1.4826 * vol_mad_30)
```

### 4.4 Structural breaks

Binary flags, fixed contribution to the score:
- New 252-session high or low
- Overnight gap: `|ln(open / prev_close)| / sigma_60 > 2`
- First cross of the 50-day MA in ≥ 20 sessions

### 4.5 News density *(optional)*

Headline count in the window vs the symbol's trailing 30-day median. Fires with no
price move — an announcement nobody has repriced yet is interesting.

### 4.6 Silence *(optional, but it's the memorable one)*

Fires when something *should* have moved the stock and didn't: a news or results
event in the window **and** `|z_idio| < 0.5`.

> *"Results were out on the 14th. The stock hasn't moved. Either the market already
> knew, or nobody's looked yet."*

Almost nobody else will build this.

### 4.7 Scoring and deduplication

```
score = 100 * sigmoid(
    w_idio   * |z_idio|
  + w_vol    * max(0, z_vol - 1)
  + w_struct * struct_flags
  + w_news   * news_flag
)
```

**Dedupe key:** `hash(symbol, detector, session_date, floor(|z|))`. Re-running the
detector produces the same key and inserts nothing; a real escalation from z=2.1 to
z=3.4 produces a new event. A unique constraint does the work.

**Cooldown:** the same `(symbol, detector)` can't fire again within 3 sessions
unless `|z|` grew by ≥ 1.0. This is the difference between a product and a noise
machine.

---

## 5. Read path

The digest is precomputed. The request path is one indexed query.

```
GET /api/digest
  1. read user_symbol_state           -> watermarks
  2. events where symbol in (watchlist)
       and detected_at > last_seen_at
       and not dismissed
  3. rank by score desc, cap at 5
  4. the rest collapse into "12 smaller changes"
```

`POST /api/seen` advances the watermark — on **dismiss or explicit "mark as read"**,
never on page load. Otherwise someone who opens the app on the train and closes it
has silently lost their diff. This is a small decision and a good one to have in
`DECISIONS.md`.

---

## 6. Identity and cross-device

No OAuth. First visit mints a `user_id` and a 6-character **account code**
(`K7M-2QX`), stored in an httpOnly cookie. "Sync to another device" shows the code;
entering it elsewhere adopts that user_id.

Because the watermark is in Postgres, not localStorage, the phone shows the same
diff state as the laptop. That's the whole answer to *"how does state persist across
sessions and devices"* and it costs one table.

---

## 7. Stale, delayed and conflicting data

Explicitly asked for in the brief. Cheap points, mostly ignored by everyone else.

**Never render a bare number.** Every quote carries `source`, `exchange_ts`,
`fetched_at`. The UI shows:

- **Live** — market open, `exchange_ts` within 2 min
- **Delayed** — badge with the real lag: "delayed 15m"
- **At close** — market shut: "as of close, 3 Sep"
- **Stale** — fetch failed: last known value, dimmed, with its age

**Conflict:** if the two sources differ by > 0.5%, don't silently pick. Set
`is_disputed`, show both, prefer the newer `exchange_ts`, log it.

**Data health panel** *(optional)*: recent disagreements, last successful fetch per
source, staleness distribution. Makes the system look operated rather than
assembled.

---

## 8. Thesis tracking — the original idea

When you add a symbol, one optional field: *why are you watching this?*

> *"Watching for margin recovery after the input-cost spike. I'd get out if they
> guide down again."*

The digest surfaces it next to the change, so the diff is read against your own
stated reason rather than a generic one. This is the feature that makes it not the
obvious watchlist, and it's the only thing here that improves the longer someone
uses it.

**Do this with templates first.** The card composes from computed facts —
decomposition, z-scores, volume, headlines — plus the thesis shown verbatim. No LLM
required, no API key, works from a clean clone.

An LLM narration layer is a *later* enhancement, and if you add it: it narrates,
never computes. Every number comes from the detector engine. Template fallback on
failure. Never a hard dependency.

---

## 9. Edge cases — this is a named judging criterion

Handle these and list them in the README. Each one is a sentence of code and a
sentence of documentation.

| Case | Handling |
|---|---|
| **Splits and bonus issues** | All return maths uses `adj_close`. An unadjusted 1:10 split reads as a 90% crash and fires every detector at once. |
| **Circuit limits** | A stock locked at upper circuit has a real price move but meaningless volume and no two-way market. Flag `circuit_state`, suppress the volume detector, label the card. Very Indian, very few will handle it. |
| **Insufficient history** | Newly listed stock with < 60 sessions has no valid `sigma_60`. Don't fire detectors on noise — show "not enough history yet" and say how many sessions are needed. |
| **Market holidays and weekends** | Never compute a change across a session boundary that doesn't exist. Use a stored NSE calendar, not `weekday != 6`. |
| **Very long absence** | Away six months? `sqrt(h)` saturates and everything reads as significant. Cap the horizon at 20 sessions and say "showing the last month." |
| **Just-added symbol** | No baseline. Watermark = `added_at`, digest says "watching from today." |
| **Concurrent devices** | Watermark update is `GREATEST(existing, incoming)`, not last-write-wins. Two devices can't rewind each other. |
| **Clock skew** | Reject `exchange_ts` in the future; fall back to `fetched_at` and mark it. |
| **Duplicate cron runs** | Idempotent via `dedupe_key`. Running the detector twice changes nothing. |
| **Delisted / renamed symbol** | Fetch fails cleanly, item stays in the list marked inactive, no crash. |
| **Zero-volume session** | MAD-based z-score, guarded against `mad = 0`. |
| **500-symbol watchlist** | Digest still caps at 5. The cap is the product, not a limitation. |
| **Float precision** | `numeric` in Postgres, strings at the boundary. No floats through the ORM for money. |

---

## 10. Design direction

The product's argument is that **magnitude is not meaning**. The interface should
say that too.

Do **not** make red/green the primary channel — red-green-by-percentage is exactly
the mental model we're arguing against. Direction is a small glyph. **Weight and
position encode materiality**: high-score cards sit higher, larger, heavier; low
scores collapse into one quiet line.

- **Palette:** paper `#FBFBF9`, ink `#141619`, slate chrome `#6B7280`, one signal
  accent `#1B4F9C`, amber `#B45309` reserved *only* for stale or disputed data.
  Five values. No gradients.
- **Type:** one family — IBM Plex Sans, with `font-variant-numeric: tabular-nums`
  on every figure so columns align. No separate mono face for labels; tabular
  figures already do that job.
- **Hero:** the time gap. First thing on screen is not a logo or a ticker grid, it's
  *"You were away 3 days"* and then the cards. Seven words that are the whole
  product.
- **Empty and failure states:** an empty watchlist says what to do next. A failed
  fetch names the source and when it last worked. Errors don't apologise.
- **Motion:** one moment — cards settling into rank order on load. Nothing else.

Avoid: identical rounded cards with identical shadows, all-caps eyebrow labels,
`01 / 02 / 03` markers, gradient washes.

---

## 11. Scope

**Core — this is the submission (Phases 0–5):**
1. Add / remove / search NSE symbols
2. Bar backfill + quote fetch with staleness metadata
3. Watermark and snapshot
4. Detectors: return z, idiosyncratic z, volume z, structural breaks
5. Digest UI — ranked cards, why-line, decomposition, dismiss
6. Table view with staleness badges
7. Account code sync
8. Thesis field (template-composed, no LLM)
9. Edge cases from §9
10. README, `DECISIONS.md`, 100-word pitch

**Upside only (Phases 6–8):**
11. Finnhub second source + data health panel
12. News density detector
13. Silence detector
14. LLM narration
15. Sensitivity dial

**Don't build:** websockets, OAuth, portfolio P&L, options, backtesting, full-page
charts, notifications, multi-watchlist.

---

## 12. Phases

Ordered by priority, not clock. Each ends committed, deployed, working.
**After Phase 5 the project is submittable.**

| # | Phase | Done when |
|---|---|---|
| 0 | Scaffold, docker-compose Postgres, Drizzle schema, **deploy to Vercel** | Empty app live at a public URL |
| 1 | Seed script: 250 sessions × ~30 NSE symbols + NIFTY, committed to the repo | Clean clone → working data, no keys |
| 2 | Detector engine + `stats_daily` + unit tests | Events populate with sane z-scores |
| 3 | Watchlist CRUD, watermark, `/api/digest`, `/api/seen`, account code | Digest returns ranked JSON |
| 4 | Frontend: digest cards, table, add/remove, staleness badges, thesis field | Clickable end to end |
| 5 | Edge cases from §9, README, `DECISIONS.md`, pitch | **Submittable. Stop here if you need to.** |
| 6 | Finnhub second source + data health panel | Disagreements visible |
| 7 | News + silence detectors | The distinctive ones |
| 8 | LLM narration, sensitivity dial | Polish |

Two rules that survive any schedule:

1. **Finish Phase 0 first.** A deploy that breaks the night before is the most
   common way to lose one of these.
2. **Write the README and pitch at the end of Phase 5, not at the very end.** They
   are graded artifacts, not paperwork.

---

## 12a. Running this without burning credits

Claude Code is cheapest writing a lot from a clear brief, most expensive exploring
and retrying.

- **One session per phase.** `/clear` between. Carried context is re-read and
  re-paid every turn.
- **Paste the phase, not the whole spec.** §3 for schema, §4 for detectors. It
  doesn't need the design section while writing migrations.
- **Batch the ask.** "Write all four detectors, their config, and their tests" in
  one prompt is far cheaper than four prompts.
- **Don't debug UI through the agent.** Look in the browser, then name the specific
  fix. Letting it run the dev server and iterate on spacing is the biggest silent
  drain there is.
- **Never "make it better" or "refactor this".** Name the file and the change.
- **Seed once, develop against the seed.** Don't fight a live API inside an agent
  loop.
- **Keep files small.** A 900-line route handler is re-read on every edit.

If credits get tight, stop at Phase 5. It's a complete, defensible submission.

---

## 13. README structure

The repo is the submission, so the README is the pitch document.

1. **One line on what it is** and the live URL
2. **Setup** — `git clone`, `npm run setup`, `npm run dev`. Three commands, no keys.
3. **The thesis** — three paragraphs, §1
4. **How "meaningful" is computed** — the z-score and the beta decomposition, with
   the formulas. This is the engineering-depth section.
5. **Architecture** — one diagram. Shared per-symbol events, tiny per-user state,
   poll the union of distinct symbols so cost is O(symbols) not O(users × symbols).
6. **Edge cases handled** — the §9 table, as-is
7. **What I deliberately didn't build, and why** — websockets, OAuth, real-time.
   Naming your cuts is a stronger signal than hiding them.
8. **Link to `DECISIONS.md`**

`DECISIONS.md`: one entry per non-obvious choice — what you picked, what you
rejected, why. Append as you go, not from memory at the end.

---

## 14. The 100-word pitch (draft — rewrite in your own voice)

> Most watchlists alert on fixed thresholds. But a 3% move means something
> different for every stock. Delta computes what changed since *you* last checked,
> normalised against each instrument's own volatility, with NIFTY's move stripped
> out so only company-specific news surfaces. Detection runs once per symbol and is
> shared across users — only read-state is per-user, so cost scales with symbols,
> not users. Every price carries its source and age; nothing renders as a bare
> number, and disagreeing feeds show as disputed rather than silently resolved. The
> digest caps at five, because a watchlist that surfaces everything surfaces
> nothing.

99 words. They'll ask you about every sentence in it, so make sure you'd defend
each one unprompted.

---

## 15. What to say when they push

- *Why z-scores and not thresholds?* A fixed percentage assumes every instrument
  has the same volatility. They don't. The z-score asks the same question
  correctly: how unusual is this, for this stock?
- *Why strip out NIFTY?* Because a stock rising with the index isn't information
  about the company. The residual is.
- *Why server-side watermarks?* localStorage means your diff resets when you open
  your phone. The baseline belongs to the user, not the browser.
- *Why precompute events?* Read is the hot path. Detection is shared across every
  user watching that symbol, so it happens once, not per request.
- *How does this scale?* Poll the union of distinct symbols, tier the cadence by
  whether anyone has the symbol open, don't poll a closed market at all. Per-user
  cost is one row per symbol.
- *What would you build next?* Learned thresholds from dismissal behaviour — the
  system should notice which alerts you never act on and stop sending them.
