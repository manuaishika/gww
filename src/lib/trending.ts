/**
 * A global, un-personalized preview of the detector engine's own output — for
 * a visitor with no watchlist yet. Events are shared across every user
 * (README architecture), so this costs nothing extra: it's the same `events`
 * table the digest reads, just not filtered to anyone's symbols.
 *
 * Answers "so what does this thing actually find" before anyone commits to
 * watching something — the first screen should never be empty of real data.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { events as eventsTable, symbols } from "./db/schema";
import { allSessions } from "./nse-calendar";

const RECENT_SESSIONS = 10; // "this week or so" — stays current, not a museum

export type TrendingItem = {
  symbol: string;
  name: string;
  currency: string;
  sector: string | null;
  detector: string;
  sessionDate: string;
  z: number;
  score: number;
  payload: Record<string, unknown>;
};

export async function getTrending(limit = 6): Promise<TrendingItem[]> {
  const sessions = allSessions();
  const cutoff = sessions[Math.max(0, sessions.length - RECENT_SESSIONS)];

  const rows = await db
    .select({
      symbol: eventsTable.symbol,
      detector: eventsTable.detector,
      sessionDate: eventsTable.sessionDate,
      z: eventsTable.z,
      score: eventsTable.score,
      payload: eventsTable.payload,
      name: symbols.name,
      currency: symbols.currency,
      sector: symbols.sector,
    })
    .from(eventsTable)
    .innerJoin(symbols, eq(symbols.symbol, eventsTable.symbol))
    .where(and(gte(eventsTable.sessionDate, cutoff), eq(symbols.isActive, true)))
    .orderBy(desc(eventsTable.score));

  // one per symbol — the same "don't let one story repeat" rule as the digest
  const seen = new Set<string>();
  const out: TrendingItem[] = [];
  for (const r of rows) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push({
      symbol: r.symbol,
      name: r.name,
      currency: r.currency,
      sector: r.sector,
      detector: r.detector,
      sessionDate: r.sessionDate,
      z: Number(r.z),
      score: Number(r.score),
      payload: (r.payload as Record<string, unknown>) ?? {},
    });
    if (out.length >= limit) break;
  }
  return out;
}
