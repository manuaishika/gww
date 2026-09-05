/**
 * A populated example account so a fresh visitor (or a judge) can see a real
 * digest without adding anything. Account code: GRW-24X.
 *
 * Doubles as the digest smoke test — asserts buildDigest returns headlines
 * ranked by score. Exits non-zero on failure.
 *
 *   npm run seed-demo
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  userSymbolState,
  users,
  watchlistItems,
} from "../src/lib/db/schema";
import { buildDigest } from "../src/lib/digest";
import { allSessions } from "../src/lib/nse-calendar";

const DEMO_USER_ID = "d0d0d0d0-0000-4000-8000-000000000001";
const DEMO_CODE = "GRW-24X";

const WATCHLIST: { symbol: string; thesis?: string; positionSize?: number }[] = [
  {
    symbol: "RELIANCE",
    thesis:
      "Watching the retail + Jio demerger chatter. Would trim if the telecom ARPU story stalls.",
  },
  { symbol: "HDFCBANK" },
  {
    symbol: "ADANIENT",
    thesis: "High-beta proxy for the group. In only for the volatility, out on any governance headline.",
    positionSize: 25, // small holding — a real move here shouldn't need a boost to matter
  },
  {
    symbol: "TITAN",
    thesis: "Discretionary bellwether — reads through to urban demand.",
    positionSize: 400, // a real, sizeable position — modest ranking nudge, not an override
  },
  { symbol: "SUNPHARMA" },
  { symbol: "INFY" },
  { symbol: "COALINDIA", thesis: "Dividend yield play; watching for a policy-driven re-rating." },
  { symbol: "TATAMOTORS" }, // demerged — exercises the delisted/renamed path
  { symbol: "NESTLEIND" }, // staged silence example: results w/ no repricing
  { symbol: "WIPRO" }, // staged news-density example: headline cluster, no move
  // --- multi-market (spec addendum): a second market, own benchmark, own currency ---
  {
    symbol: "AAPL",
    thesis: "Services mix shift — watching for the next iPhone-cycle guide, not the daily noise.",
    positionSize: 15,
  },
  { symbol: "MSFT" },
];

async function main() {
  await db
    .insert(users)
    .values({ id: DEMO_USER_ID, accountCode: DEMO_CODE })
    .onConflictDoNothing({ target: users.id });

  await db.delete(watchlistItems).where(sql`${watchlistItems.userId} = ${DEMO_USER_ID}`);
  await db.delete(userSymbolState).where(sql`${userSymbolState.userId} = ${DEMO_USER_ID}`);

  // set every watermark ~25 sessions back so the digest has real depth
  const sessions = allSessions();
  const watermark = new Date(`${sessions[Math.max(0, sessions.length - 26)]}T10:00:00.000Z`);

  for (const { symbol, thesis, positionSize } of WATCHLIST) {
    await db.insert(watchlistItems).values({
      userId: DEMO_USER_ID,
      symbol,
      thesis: thesis ?? null,
      positionSize: positionSize != null ? String(positionSize) : null,
      addedAt: watermark,
    });
    await db.insert(userSymbolState).values({
      userId: DEMO_USER_ID,
      symbol,
      lastSeenAt: watermark,
    });
  }

  const digest = await buildDigest(DEMO_USER_ID);

  // --- smoke assertions ---
  const problems: string[] = [];
  if (digest.watching !== WATCHLIST.length) {
    problems.push(`watching ${digest.watching}, expected ${WATCHLIST.length}`);
  }
  if (digest.headlines.length === 0) problems.push("no headlines");
  if (digest.headlines.length > 5) problems.push("more than 5 headlines");
  // ranked by score + position-size bonus (spec addendum), not raw score alone
  const effective = digest.headlines.map((h) => h.score + h.positionBonus);
  if (effective.some((s, i) => i > 0 && s > effective[i - 1] + 1e-9)) {
    problems.push("headlines not sorted by effective (score + position bonus) desc");
  }
  const zCanBeZero = new Set(["structural", "silence"]);
  for (const h of digest.headlines) {
    if (!(h.z !== 0 || zCanBeZero.has(h.detector))) {
      problems.push(`${h.symbol}/${h.detector}: z is 0`);
    }
    if (!h.currency) problems.push(`${h.symbol}: missing currency`);
    if (!h.chart) problems.push(`${h.symbol}: missing chart data`);
  }
  const usdHeadline = digest.headlines.find((h) => h.currency === "USD");
  if (WATCHLIST.some((w) => w.symbol === "AAPL" || w.symbol === "MSFT") && !usdHeadline) {
    // not a hard failure — US names may legitimately not make top 5 — but
    // worth knowing if the whole multi-market path is silently broken
    console.log("  (note: no USD symbol reached the top 5 this run — check manually if unexpected)");
  }

  console.log(
    `demo account ${DEMO_CODE}: watching ${digest.watching}, ` +
      `away ${digest.awayDays}d / ${digest.awaySessions} sessions, ` +
      `${digest.headlines.length} headlines, ${digest.quieter.count} quieter`,
  );
  for (const h of digest.headlines) {
    const d = h.sinceLastSeen;
    const bonus = h.positionBonus > 0 ? ` +${h.positionBonus.toFixed(1)}pos` : "";
    console.log(
      `  ${h.symbol.padEnd(8)} [${h.currency}] ${h.detector.padEnd(11)} z=${h.z.toFixed(2).padStart(6)} ` +
        `score=${h.score.toFixed(0)}${bonus}` +
        (d ? `  since: ${d.totalPct > 0 ? "+" : ""}${d.totalPct}% (mkt ${d.marketPct}%, co ${d.companyPct}%)` : ""),
    );
  }

  if (problems.length) {
    console.error("\n✗ smoke check failed:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("\n✓ digest smoke check passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
