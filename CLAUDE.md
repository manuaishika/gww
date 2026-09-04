# CLAUDE.md

Working agreement for this repo. Read `SPEC.md` first — it is the source of truth
for architecture, schema, and detector maths. This file is about *how* we work.

## Context

Solo hackathon build for Code, by Groww. Deadline 7 Sep 2026, 11:00 IST. Worked in
sessions rather than one sitting.

Judged on engineering depth, problem interpretation, resilience and edge cases,
code quality, **simplicity**, and originality — explicitly not feature count. When
something is ambiguous, pick the option that is simpler to defend, and note the
tradeoff in `DECISIONS.md`.

Default to **NSE symbols** throughout. Seed data, examples, tests, and screenshots
all use Indian equities. No US tickers anywhere.

**No LLM calls in this codebase.** All card copy is templated from event payloads.
See spec §8 for why — it is a deliberate decision, not an omission, and it should
not be quietly reintroduced.

## Build order — do not deviate

The spec's §12 phase list is the order. Two things in particular:

1. **Phase 0 ships a live Vercel URL before any feature work.** A broken build
   discovered the night before submission loses the whole thing.
2. **The detector engine gets built and tested before any UI.** It is the project.
   If the UI is ugly we still have a submission; if the detectors are wrong we have
   nothing.

Phases 0–5 are the submission. Phases 6–8 are upside and may never happen. Never
start a later phase by leaving an earlier one half-finished.

## Working style — this matters

Sessions are token-limited. Work accordingly:

- Do the whole phase in one pass. Write complete files rather than asking what to
  do next after each one.
- Don't re-read files that haven't changed. Don't survey the repo before an edit
  when the relevant path is already known.
- Don't start the dev server to check visual output. Report what changed and let
  the human look.
- Don't refactor, reorganise, or improve anything that wasn't asked for.
- If a phase is done, say so and stop. Don't roll into the next one.

## Conventions

- TypeScript strict. No `any` in `lib/detectors/**` — the maths is the deliverable.
- All detector thresholds and weights live in `lib/detectors/config.ts`. Nothing
  numeric is hardcoded inside a detector function.
- Every detector is a pure function: `(inputs) => Event | null`. No DB access inside
  detectors. This is what makes them testable in seconds.
- Money and prices are `numeric` in Postgres, handled as strings at the boundary,
  converted once. No floats through the ORM.
- All return maths uses `adj_close`, never `close`. Splits will otherwise fire
  every detector at once.
- Quotes are never returned to the client without `source`, `exchange_ts`,
  `fetched_at`. If a component receives a bare number, that's a bug.
- Timestamps are `timestamptz`, stored UTC, rendered in the user's locale.

## Testing

Only two kinds of test, and only these:

1. **Detector unit tests** against a fixed seeded fixture with known answers.
   Include: a split day, a zero-volume day, a market holiday gap, a stock that
   moved exactly with the index (should produce `z_idio ≈ 0`), and a stock that
   moved against it.
2. **One smoke test** that hits `/api/digest` and asserts it returns ranked events.

Do not write tests for React components. There is no time and they will not be
judged.

## Things that will waste hours — avoid

- Rewriting the schema after hour 6. Get it right in the first two hours.
- Building a charting layer. Sparklines only, from Recharts.
- Real-time websockets. Polling with a visible "last updated" is honest and takes
  a tenth of the time.
- Auth providers. The account code in §6 is the whole identity system.
- Fighting a market data API's rate limits live. Seed the database and develop
  against the seed. Hit the live API only in the ingest path.
- Perfecting the LLM prompt. One call, strict JSON out, template fallback, move on.

## Data source notes

- `yahoo-finance2` needs no key. **NSE symbols take a `.NS` suffix** (`RELIANCE.NS`,
  `TITAN.NS`, `HDFCBANK.NS`). The index is `^NSEI` (NIFTY 50). It gives `chart()`
  for bars, `quote()` for latest, `search()` for symbol lookup.
- **The app must run from a clean clone with no API keys.** Seed data is committed
  to the repo. Anything requiring a key is optional and degrades silently — if
  Finnhub or the LLM is absent, the app works, just with one source and template
  copy.
- Rate-limit yourself. Cache aggressively. Never poll per-user; poll the union of
  distinct symbols across all watchlists.
- All money is `numeric` in Postgres, strings at the boundary. No floats.
- All return maths uses `adj_close`. Splits and bonus issues will otherwise fire
  every detector simultaneously.

## Decision log

Maintain `DECISIONS.md` as we go. One entry per non-obvious choice: what we picked,
what we rejected, why. Judging explicitly says they care how we got there, so this
file is a deliverable, not a chore. Append to it when a decision is made, not at
the end from memory.

## Definition of done for each block

A block is done when it is committed, deployed, and visibly working at the live
URL. Not when it works locally. Push often.
