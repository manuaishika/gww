/**
 * The detectors and the engine that runs them.
 *
 * Each detector is pure: (ctx, signals) => DetectorHit | null. `signals` is
 * derived purely from `ctx` (one pass, see signals.ts) and passed in so the
 * work isn't repeated four times. No detector touches the DB or the clock.
 *
 * `detectSymbol` composes their output into ONE event per (symbol, session) —
 * the dominant signal plus every computed fact, so a digest card never needs a
 * second query to explain itself.
 */
import { CONFIG } from "./config";
import { dedupeKey } from "./dedupe";
import { clamp, pct, sigmoid } from "./math";
import { computeSignals, type Signals } from "./signals";
import type {
  DetectContext,
  DetectorHit,
  EventSignals,
  SessionEvent,
} from "./types";

const hasHistory = (ctx: DetectContext): boolean =>
  ctx.stats.sessionsAvailable >= CONFIG.history.minSessionsForStats;

const round = (n: number, dp: number): number => Number.parseFloat(n.toFixed(dp));

// ─── 4.1 return z-score ──────────────────────────────────────────────────────
export function detectReturnZ(ctx: DetectContext, s: Signals): DetectorHit | null {
  if (!hasHistory(ctx) || s.zRet == null || s.ret == null) return null;
  if (Math.abs(s.zRet) < CONFIG.returnZ.notable) return null;

  return {
    detector: "return_z",
    z: round(s.zRet, 3),
    payload: {
      returnPct: round(pct(s.ret), 2),
      horizonSessions: round(s.horizon, 2),
      baselineDate: s.baselineDate,
      sigma60: ctx.stats.sigma60,
      strength: Math.abs(s.zRet) >= CONFIG.returnZ.strong ? "strong" : "notable",
    },
  };
}

// ─── 4.2 idiosyncratic move — the one that matters ───────────────────────────
export function detectIdiosyncratic(
  ctx: DetectContext,
  s: Signals,
): DetectorHit | null {
  if (!hasHistory(ctx) || s.zIdio == null || s.residual == null) return null;
  if (Math.abs(s.zIdio) < CONFIG.idio.notable) return null;

  return {
    detector: "idio_z",
    z: round(s.zIdio, 3),
    payload: {
      totalPct: round(pct(s.ret ?? 0), 2),
      marketPct: round(pct(s.marketLogRet ?? 0), 2),
      companyPct: round(pct(s.residual), 2),
      beta60: ctx.stats.beta60 == null ? null : round(ctx.stats.beta60, 3),
      horizonSessions: round(s.horizon, 2),
      baselineDate: s.baselineDate,
      strength: Math.abs(s.zIdio) >= CONFIG.idio.strong ? "strong" : "notable",
    },
  };
}

// ─── 4.3 volume anomaly ─────────────────────────────────────────────────────
export function detectVolume(ctx: DetectContext, s: Signals): DetectorHit | null {
  // a circuit-locked stock has no two-way market — volume is meaningless
  if (ctx.circuitState !== "none") return null;
  if (!hasHistory(ctx) || s.zVol == null || s.volToday == null) return null;
  if (s.zVol < CONFIG.volume.emitZ) return null;

  return {
    detector: "volume_z",
    z: round(s.zVol, 3),
    payload: {
      volume: s.volToday,
      medianVolume30: ctx.stats.volMedian30,
      timesMedian:
        ctx.stats.volMedian30 && ctx.stats.volMedian30 > 0
          ? round(s.volToday / ctx.stats.volMedian30, 1)
          : null,
    },
  };
}

// ─── 4.4 structural breaks ──────────────────────────────────────────────────
export function detectStructural(
  ctx: DetectContext,
  s: Signals,
): DetectorHit | null {
  if (!hasHistory(ctx) || s.structFlags === 0) return null;

  const flags: string[] = [];
  if (s.new252High) flags.push("new_252d_high");
  if (s.new252Low) flags.push("new_252d_low");
  if (s.gap) flags.push("overnight_gap");
  if (s.maCrossUp) flags.push("ma50_cross_up");
  if (s.maCrossDown) flags.push("ma50_cross_down");

  return {
    detector: "structural",
    z: round(s.gapZ ?? 0, 3),
    payload: {
      flags,
      gapZ: s.gapZ == null ? null : round(s.gapZ, 2),
      returnPct: round(pct(s.ret ?? 0), 2),
    },
  };
}

// ─── 4.5 news density (optional) ────────────────────────────────────────────
export function detectNewsDensity(
  ctx: DetectContext,
  s: Signals,
): DetectorHit | null {
  if (!s.newsDensityFlag) return null;
  return {
    detector: "news_density",
    z: s.newsCountWindow, // not a z-score — a count, kept for display/debug
    payload: {
      newsCountWindow: s.newsCountWindow,
      windowDays: CONFIG.news.densityWindowDays,
      returnPct: round(pct(s.ret ?? 0), 2),
    },
  };
}

// ─── 4.6 silence — fires with no price move, that's the point ──────────────
export function detectSilence(ctx: DetectContext, s: Signals): DetectorHit | null {
  if (!s.silenceFlag) return null;
  return {
    detector: "silence",
    z: 0, // deliberately: the signal here is the ABSENCE of a move
    payload: {
      daysSinceNews: s.daysSinceNews == null ? null : Math.round(s.daysSinceNews),
      idioZ: s.zIdio == null ? null : round(s.zIdio, 3),
    },
  };
}

export const DETECTORS = [
  detectReturnZ,
  detectIdiosyncratic,
  detectVolume,
  detectStructural,
  detectNewsDensity,
  detectSilence,
] as const;

// ─── scoring: score = 100 · sigmoid(Σ wᵢ · featureᵢ) ────────────
// News/silence are binary flags with a fixed contribution, like structural
// breaks — there's no natural z-score for "a headline
// count" or "the absence of a move."
function sessionScore(s: Signals): number {
  const w = CONFIG.score.weights;
  const volTerm = clamp(
    Math.max(0, (s.zVol ?? 0) - 1),
    0,
    CONFIG.score.volContributionCap,
  );
  const sum =
    w.idio * Math.abs(s.zIdio ?? 0) +
    w.ret * Math.max(0, Math.abs(s.zRet ?? 0) - CONFIG.returnZ.notable) +
    w.vol * volTerm +
    w.struct * s.structFlags +
    w.news * Number(s.newsDensityFlag || s.silenceFlag);
  return 100 * sigmoid(sum);
}

/** Which fired signal should headline the card. */
function dominantDetector(hits: DetectorHit[]): DetectorHit {
  // idiosyncratic is "the one that matters" whenever it fired
  const idio = hits.find((h) => h.detector === "idio_z");
  if (idio) return idio;
  // silence can only fire alongside idio when idio didn't cross its own
  // threshold (silence requires |z_idio| < 0.5), so it never has to compete with
  // idio for the headline — but it's the most narratively distinctive signal
  // when present, so it outranks volume/structural/news.
  const silence = hits.find((h) => h.detector === "silence");
  if (silence) return silence;
  return [...hits].sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
}

/**
 * Run every detector for one session of one symbol and compose ONE event —
 * the dominant signal plus every computed fact.
 */
export function detectSymbol(ctx: DetectContext): SessionEvent | null {
  const signals = computeSignals(ctx);

  const hits = DETECTORS.map((d) => d(ctx, signals)).filter(
    (h): h is DetectorHit => h !== null,
  );
  if (hits.length === 0) return null;

  const score = round(sessionScore(signals), 1);
  if (score < CONFIG.score.minToEmit) return null;

  const dominant = dominantDetector(hits);
  const structuralHit = hits.find((h) => h.detector === "structural");

  const eventSignals: EventSignals = {
    returnZ: signals.zRet == null ? null : round(signals.zRet, 3),
    returnPct: signals.ret == null ? null : round(pct(signals.ret), 2),
    idioZ: signals.zIdio == null ? null : round(signals.zIdio, 3),
    totalPct: signals.ret == null ? null : round(pct(signals.ret), 2),
    marketPct:
      signals.marketLogRet == null ? null : round(pct(signals.marketLogRet), 2),
    companyPct: signals.residual == null ? null : round(pct(signals.residual), 2),
    beta60: ctx.stats.beta60 == null ? null : round(ctx.stats.beta60, 3),
    volumeZ: signals.zVol == null ? null : round(signals.zVol, 3),
    timesMedian:
      ctx.stats.volMedian30 && ctx.stats.volMedian30 > 0 && signals.volToday != null
        ? round(signals.volToday / ctx.stats.volMedian30, 1)
        : null,
    structural: (structuralHit?.payload.flags as string[]) ?? [],
    horizonSessions: round(signals.horizon, 2),
    baselineDate: signals.baselineDate,
    newsCount: signals.newsCountWindow > 0 ? signals.newsCountWindow : null,
    isSilence: signals.silenceFlag,
  };

  return {
    symbol: ctx.symbol,
    detector: dominant.detector,
    sessionDate: ctx.sessionDate,
    z: dominant.z,
    score,
    dedupeKey: dedupeKey(ctx.symbol, ctx.sessionDate, dominant.z),
    signals: eventSignals,
  };
}
