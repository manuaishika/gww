/**
 * Dev-only. Regenerates the committed seed dataset:
 *   src/lib/seed/bars.json          — ~250 trading sessions of daily bars
 *   src/lib/seed/nse-calendar.json  — the NSE session calendar (spec §9)
 *
 * yahoo-finance2 needs no API key, so this is re-runnable by anyone. The output
 * is committed so a clean clone has real NSE data with zero configuration.
 *
 *   node scripts/fetch-bars.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YahooFinance from "yahoo-finance2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "src", "lib", "seed");

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// keep in sync with src/lib/seed-data.ts
const NIFTY_SYMBOL = "NIFTY50";
const EQUITIES = [
  "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "BHARTIARTL",
  "ITC", "LT", "KOTAKBANK", "HINDUNILVR", "AXISBANK", "BAJFINANCE", "ASIANPAINT",
  "MARUTI", "SUNPHARMA", "TITAN", "NTPC", "POWERGRID", "ULTRACEMCO", "M&M",
  "TATASTEEL", "WIPRO", "NESTLEIND", "ADANIENT", "JSWSTEEL", "COALINDIA",
  "HCLTECH", "DRREDDY", "EICHERMOT",
  // TATAMOTORS is intentionally omitted: it demerged in 2025 and no longer
  // trades. It stays in the symbols table (isActive:false) as a real
  // delisted/renamed example — see src/lib/seed-data.ts.
];

const TARGET_SESSIONS = 250;
const yahooSymbol = (s) => (s === NIFTY_SYMBOL ? "^NSEI" : `${s}.NS`);

/** yahoo daily bars are stamped 03:45:00Z (09:15 IST open) — take the IST date. */
const istDate = (d) =>
  new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const round = (n, dp = 4) =>
  n == null ? null : Number.parseFloat(Number(n).toFixed(dp));

const todayIso = new Date().toISOString().slice(0, 10);

async function fetchBars(symbol) {
  const period1 = new Date(Date.now() - 420 * 24 * 3600 * 1000);
  const res = await yf.chart(yahooSymbol(symbol), {
    period1,
    interval: "1d",
  });
  return res.quotes
    .filter((q) => q.close != null && q.date != null)
    .map((q) => ({
      d: istDate(new Date(q.date)),
      o: round(q.open),
      h: round(q.high),
      l: round(q.low),
      c: round(q.close),
      ac: round(q.adjclose ?? q.close),
      v: q.volume == null ? 0 : Math.round(q.volume),
    }))
    .filter((b) => b.d < todayIso); // drop any live partial session
}

async function main() {
  console.log(`→ fetching ^NSEI to establish the session calendar…`);
  const niftyRaw = await fetchBars(NIFTY_SYMBOL);
  const sessions = [...new Set(niftyRaw.map((b) => b.d))]
    .sort()
    .slice(-TARGET_SESSIONS);
  const sessionSet = new Set(sessions);
  console.log(`  ${sessions.length} sessions: ${sessions[0]} … ${sessions.at(-1)}`);

  const bars = {};
  bars[NIFTY_SYMBOL] = niftyRaw.filter((b) => sessionSet.has(b.d));

  for (const sym of EQUITIES) {
    process.stdout.write(`→ ${sym} `);
    try {
      const raw = await fetchBars(sym);
      const aligned = raw.filter((b) => sessionSet.has(b.d));
      bars[sym] = aligned;
      const missing = sessions.length - aligned.length;
      console.log(`${aligned.length} bars${missing ? `  (${missing} missing sessions)` : ""}`);
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      bars[sym] = [];
    }
    await new Promise((r) => setTimeout(r, 250)); // be polite
  }

  await mkdir(SEED_DIR, { recursive: true });

  await writeFile(
    join(SEED_DIR, "bars.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), targetSessions: TARGET_SESSIONS, sessions, bars },
      null,
      0,
    ) + "\n",
  );

  await writeFile(
    join(SEED_DIR, "nse-calendar.json"),
    JSON.stringify(
      {
        note: "NSE trading sessions, derived from ^NSEI. Used to count sessions between two dates without assuming weekday != Sunday (spec §9).",
        generatedAt: new Date().toISOString(),
        sessions,
      },
      null,
      0,
    ) + "\n",
  );

  const rows = Object.values(bars).reduce((n, arr) => n + arr.length, 0);
  console.log(`\n✓ wrote src/lib/seed/bars.json — ${Object.keys(bars).length} symbols, ${rows} bars`);
  console.log(`✓ wrote src/lib/seed/nse-calendar.json — ${sessions.length} sessions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
