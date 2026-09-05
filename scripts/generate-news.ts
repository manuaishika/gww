/**
 * Regenerates the committed illustrative "results calendar":
 *   src/lib/seed/news.json
 *
 * There is no live news feed wired up — adding one needs an API key, which
 * would break the "no keys, works from a clean clone" guarantee the moment
 * anyone searched for a symbol. This is structured event
 * DATES only (no scraped headline text), deterministic from the symbol name
 * so it's reproducible, plus two examples engineered against the REAL price
 * series (src/lib/seed/bars.json) to demonstrate the news-density and
 * silence detectors (spec §4.5, §4.6) actually firing, not just described.
 *
 *   npx tsx scripts/generate-news.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_SYMBOLS } from "../src/lib/seed-data";

const OUT = join(process.cwd(), "src", "lib", "seed", "news.json");

const WINDOW_START = new Date("2025-09-15T00:00:00Z");
const WINDOW_DAYS = 340; // stays inside the ~250-session seed window

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

type NewsRow = { symbol: string; eventDate: string; kind: "results" | "headline" };

function build(): NewsRow[] {
  const events: NewsRow[] = [];

  // One illustrative "results" date per equity — spread deterministically
  // across the window so it reads as plausible quarterly-results texture,
  // not a real calendar.
  for (const s of SEED_SYMBOLS) {
    if (s.isActive === false) continue; // skip the delisted example
    const offset = hashCode(s.symbol) % WINDOW_DAYS;
    const date = new Date(WINDOW_START.getTime() + offset * 86_400_000);
    events.push({ symbol: s.symbol, eventDate: iso(date), kind: "results" });
  }

  // Staged, on purpose, against real dates checked against the real price
  // series:
  events.push(
    // NESTLEIND's idiosyncratic move on 2026-08-27 was ~0.002σ — about as
    // quiet as this dataset gets. A "results" date a week earlier makes the
    // silence detector fire: results happened, nothing moved.
    { symbol: "NESTLEIND", eventDate: "2026-08-20", kind: "results" },
    // WIPRO's 2026-09-03 session is quiet on every OTHER detector (checked:
    // |z_ret|, |z_idio|, |z_vol| all < 1, no structural flags). Two headlines
    // in the preceding week make news-density the only thing that fires.
    { symbol: "WIPRO", eventDate: "2026-08-28", kind: "headline" },
    { symbol: "WIPRO", eventDate: "2026-08-31", kind: "headline" },
  );

  events.sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.eventDate.localeCompare(b.eventDate),
  );
  return events;
}

const events = build();
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), events }, null, 0) + "\n",
);
console.log(
  `✓ wrote src/lib/seed/news.json — ${events.length} events across ${new Set(events.map((e) => e.symbol)).size} symbols`,
);
