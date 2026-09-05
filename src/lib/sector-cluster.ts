/**
 * Pure sector-clustering logic, pulled out of digest.ts so it's testable
 * without a database or the system clock (same reasoning as the detectors).
 *
 * idio_z strips out NIFTY, not the sector — it's a one-factor model. If ≥3
 * watched symbols in the SAME sector fire idio_z on the SAME session, that
 * isn't 3 independent company stories; it's evidence of a sector-wide factor
 * the model can't separate from true company-specific news. Real example
 * found in the seed data: TCS, INFY, WIPRO, HCLTECH all fired idio_z on
 * 2026-02-12 — a same-day, same-sector quadruple that's obviously one story,
 * not four.
 */

export type ClusterableEvent = {
  id: string;
  symbol: string;
  sessionDate: string;
  detector: string;
  score: number;
};

export type SectorCluster = { sector: string; symbols: string[] };

export type ClusterResult = {
  /** event id -> the cluster it represents (only set on the highest-scoring member) */
  clusterByRepresentativeId: Map<string, SectorCluster>;
  /** ids of non-representative cluster members — drop these from ranking entirely */
  suppressedEventIds: Set<string>;
};

/**
 * @param events         every candidate event in the window (not yet reduced
 *                       to one per symbol — a symbol's single best event over
 *                       a multi-week window is rarely the same session as its
 *                       sector-mates' best events, even when a real same-day
 *                       cluster happened, so this must run on the full list)
 * @param sectorOf       symbol -> sector (null/undefined symbols are ignored)
 * @param minClusterSize a cluster needs at least this many DISTINCT symbols
 */
export function clusterSectorMoves(
  events: readonly ClusterableEvent[],
  sectorOf: (symbol: string) => string | null | undefined,
  minClusterSize = 3,
): ClusterResult {
  const buckets = new Map<string, ClusterableEvent[]>();
  for (const e of events) {
    if (e.detector !== "idio_z") continue;
    const sector = sectorOf(e.symbol);
    if (!sector) continue;
    const key = `${sector}::${e.sessionDate}`;
    const arr = buckets.get(key) ?? [];
    arr.push(e);
    buckets.set(key, arr);
  }

  const clusterByRepresentativeId = new Map<string, SectorCluster>();
  const suppressedEventIds = new Set<string>();

  for (const [key, members] of buckets) {
    const distinctSymbols = [...new Set(members.map((m) => m.symbol))];
    if (distinctSymbols.length < minClusterSize) continue;

    const sector = key.slice(0, key.lastIndexOf("::"));
    const sorted = [...members].sort((a, b) => b.score - a.score);
    clusterByRepresentativeId.set(sorted[0].id, { sector, symbols: distinctSymbols });
    for (const m of sorted.slice(1)) suppressedEventIds.add(m.id);
  }

  return { clusterByRepresentativeId, suppressedEventIds };
}
