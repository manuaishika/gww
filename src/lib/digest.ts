/**
 * The digest (spec §5). Read path:
 *   1. watchlist + per-symbol watermarks
 *   2. events since each watermark, not dismissed
 *   3. rank by score, cap at 5; the rest collapse into a count
 *   4. attach the "since you last checked" decomposition + the thesis
 *
 * Computed live for now. Precomputing/caching is a Phase 5 concern — the shape
 * of this function is already "one pass", so caching is a drop-in later.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { events as eventsTable, statsDaily, userEventState } from "./db/schema";
import { listWatchlist, type WatchlistRow } from "./watchlist";
import { loadBars } from "./detect-run";
import { computeSignals, type Bar, type SymbolStats } from "./detectors";
import { lastSession, sessionsBetween } from "./nse-calendar";
import { clusterSectorMoves, type SectorCluster } from "./sector-cluster";
import { effectiveScore, positionBonus } from "./position-weight";

const MS_DAY = 86_400_000;
const num = (v: string | null): number | null => (v == null ? null : Number(v));

export type { SectorCluster };

export type DigestEvent = {
  id: string;
  symbol: string;
  name: string;
  detector: string;
  sessionDate: string;
  z: number;
  score: number;
  payload: Record<string, unknown>;
  thesis: string | null;
  sinceLastSeen: Decomposition | null;
  /** ≥3 watched symbols in the same sector fired idio_z the same session —
   *  see buildDigest for why that's a model limitation, not 3 separate stories. */
  sectorCluster: SectorCluster | null;
  currency: string;
  positionSize: number | null;
  /** points added to score by position size when ranking (never stored) — 0 if none set. */
  positionBonus: number;
  chart: SymbolChart | null;
};

export type SymbolChart = {
  /** last 60 sessions, chronological — the "absence chart" (spec addendum). */
  closes: { date: string; close: number }[];
  /** the daily return z (r / σ₆₀) for each of those sessions — the "z-context strip". */
  zHistory: { date: string; z: number }[];
  /** first session strictly after the watermark — where to shade the absence chart. */
  watermarkDate: string | null;
};

type Decomposition = {
  sessions: number;
  totalPct: number;
  marketPct: number;
  companyPct: number;
};

export type Digest = {
  accountCode?: string;
  awayDays: number | null;
  awaySessions: number | null;
  lastCheckedAt: string | null;
  watching: number;
  headlines: DigestEvent[];
  quieter: { count: number; symbols: { symbol: string; count: number }[] };
  emptyReason: "no_watchlist" | "all_quiet" | null;
};

export async function buildDigest(userId: string): Promise<Digest> {
  const items = await listWatchlist(userId);
  const active = items.filter((i) => i.isActive);
  const bySymbol = new Map(items.map((i) => [i.symbol, i]));

  if (items.length === 0) {
    return {
      awayDays: null,
      awaySessions: null,
      lastCheckedAt: null,
      watching: 0,
      headlines: [],
      quieter: { count: 0, symbols: [] },
      emptyReason: "no_watchlist",
    };
  }

  // most recent watermark = the last time the user acknowledged anything
  const seenTimes = items
    .map((i) => (i.lastSeenAt ? Date.parse(i.lastSeenAt) : null))
    .filter((t): t is number => t != null);
  const lastCheckedMs = seenTimes.length ? Math.max(...seenTimes) : null;
  const oldestWatermark = seenTimes.length ? Math.min(...seenTimes) : null;
  const awayDays =
    lastCheckedMs == null
      ? null
      : Math.max(0, Math.floor((Date.now() - lastCheckedMs) / MS_DAY));
  const awaySessions =
    lastCheckedMs == null
      ? null
      : sessionsBetween(new Date(lastCheckedMs).toISOString(), lastSession);

  // --- events since each symbol's watermark, not dismissed ---
  const activeSymbols = active.map((i) => i.symbol);
  const rawEvents = activeSymbols.length
    ? await db
        .select({
          id: eventsTable.id,
          symbol: eventsTable.symbol,
          detector: eventsTable.detector,
          sessionDate: eventsTable.sessionDate,
          z: eventsTable.z,
          score: eventsTable.score,
          payload: eventsTable.payload,
          detectedAt: eventsTable.detectedAt,
          dismissed: userEventState.status,
        })
        .from(eventsTable)
        .leftJoin(
          userEventState,
          and(
            eq(userEventState.eventId, eventsTable.id),
            eq(userEventState.userId, userId),
          ),
        )
        .where(
          and(
            inArray(eventsTable.symbol, activeSymbols),
            or(
              isNull(userEventState.status),
              sql`${userEventState.status} <> 'dismissed'`,
            ),
          ),
        )
        .orderBy(desc(eventsTable.score))
    : [];

  const sinceWatermark = rawEvents.filter((e) => {
    const item = bySymbol.get(e.symbol);
    if (!item) return false;
    const wm = item.lastSeenAt ? Date.parse(item.lastSeenAt) : 0;
    return Date.parse(iso(e.detectedAt)) > wm;
  });

  // sector clustering — an honest correction for a one-factor model. Pure
  // logic lives in sector-cluster.ts (unit tested there); this just wires it
  // to the watchlist's sectors. See DECISIONS.md for a real example found in
  // the seed data.
  const { clusterByRepresentativeId, suppressedEventIds } = clusterSectorMoves(
    sinceWatermark.map((e) => ({
      id: e.id,
      symbol: e.symbol,
      sessionDate: e.sessionDate,
      detector: e.detector,
      score: Number(e.score),
    })),
    (symbol) => bySymbol.get(symbol)?.sector,
  );
  const declustered = sinceWatermark.filter((e) => !suppressedEventIds.has(e.id));

  // one event per (symbol) for the headline set — ranked by score PLUS the
  // optional position-size nudge (spec addendum) — kept out of the shared
  // events.score column entirely; this only affects this user's ranking.
  // Keep the rest for the collapsed count.
  const seenSymbol = new Set<string>();
  const ranked = [...declustered].sort((a, b) => {
    const posA = num(bySymbol.get(a.symbol)?.positionSize ?? null);
    const posB = num(bySymbol.get(b.symbol)?.positionSize ?? null);
    return (
      effectiveScore(Number(b.score), posB) - effectiveScore(Number(a.score), posA)
    );
  });
  const primary: typeof ranked = [];
  const secondary: typeof ranked = [];
  for (const e of ranked) {
    if (seenSymbol.has(e.symbol)) secondary.push(e);
    else {
      seenSymbol.add(e.symbol);
      primary.push(e);
    }
  }

  const headlineRows = primary.slice(0, 5);
  const rest = [...primary.slice(5), ...secondary];

  // --- decomposition + chart data since watermark, per headline symbol ---
  // Every symbol regresses against ITS OWN benchmark (spec addendum), not one
  // global index — load each distinct benchmark's bars once.
  const benchmarkCache = new Map<string, Promise<Bar[]>>();
  const getBenchmarkBars = (benchmarkSymbol: string) => {
    let p = benchmarkCache.get(benchmarkSymbol);
    if (!p) {
      p = loadBars(benchmarkSymbol);
      benchmarkCache.set(benchmarkSymbol, p);
    }
    return p;
  };

  const statsRows = headlineRows.length
    ? await db
        .select()
        .from(statsDaily)
        .where(inArray(statsDaily.symbol, headlineRows.map((e) => e.symbol)))
    : [];
  const statsBySymbol = new Map(statsRows.map((s) => [s.symbol, toStats(s)]));

  const headlines: DigestEvent[] = [];
  for (const e of headlineRows) {
    const item = bySymbol.get(e.symbol)!;
    const indexBars = await getBenchmarkBars(item.benchmarkSymbol);
    const stats = statsBySymbol.get(e.symbol) ?? null;
    const bars = await loadBars(e.symbol);
    const decomposition = decompose(e.symbol, item.lastSeenAt, bars, indexBars, stats);
    const chart = buildSymbolChart(bars, item.lastSeenAt, stats);
    const positionSize = num(item.positionSize);
    headlines.push({
      id: e.id,
      symbol: e.symbol,
      name: item.name,
      detector: e.detector,
      sessionDate: e.sessionDate,
      z: Number(e.z),
      score: Number(e.score),
      payload: (e.payload as Record<string, unknown>) ?? {},
      thesis: item.thesis,
      sinceLastSeen: decomposition,
      sectorCluster: clusterByRepresentativeId.get(e.id) ?? null,
      currency: item.currency,
      positionSize,
      positionBonus: round(positionBonus(positionSize), 1),
      chart,
    });
  }

  const quieterBySymbol = new Map<string, number>();
  for (const e of rest) {
    quieterBySymbol.set(e.symbol, (quieterBySymbol.get(e.symbol) ?? 0) + 1);
  }

  return {
    awayDays,
    awaySessions,
    lastCheckedAt: lastCheckedMs ? new Date(lastCheckedMs).toISOString() : null,
    watching: items.length,
    headlines,
    quieter: {
      count: rest.length,
      symbols: [...quieterBySymbol.entries()]
        .map(([symbol, count]) => ({ symbol, count }))
        .sort((a, b) => b.count - a.count),
    },
    emptyReason:
      headlines.length === 0
        ? oldestWatermark == null
          ? null
          : "all_quiet"
        : null,
  };
}

function decompose(
  symbol: string,
  watermarkIso: string | null,
  bars: Bar[],
  indexBars: Bar[],
  stats: SymbolStats | null,
): Decomposition | null {
  if (!stats || bars.length < 2) return null;

  const wm = watermarkIso ? watermarkIso.slice(0, 10) : bars[0].sessionDate;
  // baseline = last session on or before the watermark
  let baseIdx = bars.findLastIndex((b) => b.sessionDate <= wm);
  if (baseIdx < 0) baseIdx = 0;
  const horizonSessions = Math.max(1, bars.length - 1 - baseIdx);

  const signals = computeSignals({
    symbol,
    sessionDate: bars[bars.length - 1].sessionDate,
    bars,
    indexBars,
    stats,
    horizonSessions,
    circuitState: "none",
    newsEvents: [], // this recomputation is for the return decomposition only
  });

  if (signals.ret == null) return null;
  return {
    sessions: Math.round(signals.horizon),
    totalPct: round((Math.exp(signals.ret) - 1) * 100, 2),
    marketPct: round((Math.exp(signals.marketLogRet ?? 0) - 1) * 100, 2),
    companyPct: round((Math.exp(signals.residual ?? signals.ret) - 1) * 100, 2),
  };
}

const CHART_SESSIONS = 60;

/**
 * Chart data for a headline card (spec addendum, 4 cheap charts):
 *   - absence chart: last 60 sessions' close, shaded from `watermarkDate`
 *   - z-context strip: each of those sessions' own return z, so the current
 *     move's outlier status is visible in the distribution, not asserted
 * Reuses the same bars array `decompose` already has — no extra query.
 */
function buildSymbolChart(
  bars: Bar[],
  watermarkIso: string | null,
  stats: SymbolStats | null,
): SymbolChart | null {
  if (bars.length < 2) return null;
  const window = bars.slice(-CHART_SESSIONS);
  const sigma60 = stats?.sigma60;

  const closes = window.map((b) => ({ date: b.sessionDate, close: b.adjClose }));
  const zHistory: { date: string; z: number }[] = [];
  for (let i = 1; i < window.length; i++) {
    if (!sigma60 || sigma60 <= 0) break;
    const r = Math.log(window[i].adjClose / window[i - 1].adjClose);
    zHistory.push({ date: window[i].sessionDate, z: round(r / sigma60, 3) });
  }

  const wm = watermarkIso ? watermarkIso.slice(0, 10) : null;
  const watermarkDate = wm ? (window.find((b) => b.sessionDate > wm)?.sessionDate ?? null) : null;

  return { closes, zHistory, watermarkDate };
}

function toStats(s: typeof statsDaily.$inferSelect): SymbolStats {
  return {
    sigma60: num(s.sigma60),
    beta60: num(s.beta60),
    residSigma60: num(s.residSigma60),
    volMedian30: num(s.volMedian30),
    volMad30: num(s.volMad30),
    high252: num(s.high252),
    low252: num(s.low252),
    sessionsAvailable: s.sessionsAvailable,
  };
}

const iso = (d: Date | string) =>
  typeof d === "string" ? d : d.toISOString();
const round = (n: number, dp: number) => Number.parseFloat(n.toFixed(dp));

export type { WatchlistRow };
