/**
 * The full watchable universe, grouped by sector, with a per-user "already on
 * your watchlist" flag — for the Discover tab's browse-by-sector view.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { symbols, watchlistItems } from "./db/schema";
import { NIFTY_SYMBOL, SPX_SYMBOL } from "./seed-data";

export type UniverseSymbol = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  onWatchlist: boolean;
};

export type SectorGroup = { sector: string; symbols: UniverseSymbol[] };

export async function getUniverse(userId: string): Promise<SectorGroup[]> {
  const [all, watched] = await Promise.all([
    db
      .select({
        symbol: symbols.symbol,
        name: symbols.name,
        sector: symbols.sector,
        currency: symbols.currency,
        exchange: symbols.exchange,
      })
      .from(symbols)
      .where(eq(symbols.isActive, true))
      .orderBy(symbols.name),
    db
      .select({ symbol: watchlistItems.symbol })
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, userId)),
  ]);

  const watchedSet = new Set(watched.map((w) => w.symbol));
  const indices = new Set([NIFTY_SYMBOL, SPX_SYMBOL]);

  const bySector = new Map<string, UniverseSymbol[]>();
  for (const s of all) {
    if (indices.has(s.symbol)) continue; // benchmarks aren't watchable picks
    const sector = s.sector ?? "Other";
    const arr = bySector.get(sector) ?? [];
    arr.push({
      symbol: s.symbol,
      name: s.name,
      currency: s.currency,
      exchange: s.exchange,
      onWatchlist: watchedSet.has(s.symbol),
    });
    bySector.set(sector, arr);
  }

  return [...bySector.entries()]
    .map(([sector, syms]) => ({ sector, symbols: syms }))
    .sort((a, b) => b.symbols.length - a.symbols.length || a.sector.localeCompare(b.sector));
}
