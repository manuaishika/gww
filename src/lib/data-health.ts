/**
 * "Makes the system look operated rather than assembled" (spec §7, optional).
 * Global, not per-user — this describes the shared quote data, same for
 * everyone.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { quotesLatest, symbols } from "./db/schema";
import { isFinnhubConfigured } from "./ingest/finnhub";

export type DataHealth = {
  sources: { primary: string; secondary: string | null };
  totalQuotes: number;
  lastFetchedAt: string | null;
  disputes: { symbol: string; name: string; note: string | null }[];
  circuitLocked: { symbol: string; name: string; state: string }[];
};

export async function getDataHealth(): Promise<DataHealth> {
  const rows = await db
    .select({
      symbol: quotesLatest.symbol,
      name: symbols.name,
      fetchedAt: quotesLatest.fetchedAt,
      isDisputed: quotesLatest.isDisputed,
      disputeNote: quotesLatest.disputeNote,
      circuitState: quotesLatest.circuitState,
    })
    .from(quotesLatest)
    .innerJoin(symbols, eq(symbols.symbol, quotesLatest.symbol));

  const lastFetchedAt = rows
    .map((r) => r.fetchedAt?.getTime())
    .filter((t): t is number => t != null)
    .reduce((max, t) => (t > max ? t : max), 0);

  return {
    sources: {
      primary: "yahoo-finance2",
      secondary: isFinnhubConfigured() ? "finnhub" : null,
    },
    totalQuotes: rows.length,
    lastFetchedAt: lastFetchedAt ? new Date(lastFetchedAt).toISOString() : null,
    disputes: rows
      .filter((r) => r.isDisputed)
      .map((r) => ({ symbol: r.symbol, name: r.name, note: r.disputeNote })),
    circuitLocked: rows
      .filter((r) => r.circuitState && r.circuitState !== "none")
      .map((r) => ({ symbol: r.symbol, name: r.name, state: r.circuitState! })),
  };
}
