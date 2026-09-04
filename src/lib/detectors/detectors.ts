/**
 * The four detectors (spec §4.1–§4.4) and the engine that runs them.
 *
 * Each detector is pure: (ctx, signals) => DetectorEvent | null. `signals` is
 * derived purely from `ctx` (one pass, see signals.ts) and passed in so the
 * work isn't repeated four times. No detector touches the DB or the clock.
 */
import { CONFIG } from "./config";
import { dedupeKey } from "./dedupe";
import { pct, sigmoid } from "./math";
import { computeSignals, type Signals } from "./signals";
import type { DetectContext, DetectorEvent } from "./types";

const hasHistory = (ctx: DetectContext): boolean =>
  ctx.stats.sessionsAvailable >= CONFIG.history.minSessionsForStats;

const round = (n: number, dp: number): number =>
  Number.parseFloat(n.toFixed(dp));

// ─── 4.1 return z-score ──────────────────────────────────────────────────────
export function detectReturnZ(
  ctx: DetectContext,
  s: Signals,
): DetectorEvent | null {
  if (!hasHistory(ctx) || s.zRet == null || s.ret == null) return null;
  if (Math.abs(s.zRet) < CONFIG.returnZ.notable) return null;

  return {
    symbol: ctx.symbol,
    detector: "return_z",
    sessionDate: ctx.sessionDate,
    z: round(s.zRet, 3),
    score: 0,
    dedupeKey: dedupeKey(ctx.symbol, "return_z", ctx.sessionDate, s.zRet),
    payload: {
      returnPct: round(pct(s.ret), 2),
      horizonSessions: round(s.horizon, 2),
      baselineDate: s.baselineDate,
      sigma60: ctx.stats.sigma60,
      strength:
        Math.abs(s.zRet) >= CONFIG.returnZ.strong ? "strong" : "notable",
    },
  };
}

// ─── 4.2 idiosyncratic move — the one that matters ───────────────────────────
export function detectIdiosyncratic(
  ctx: DetectContext,
  s: Signals,
): DetectorEvent | null {
  if (!hasHistory(ctx) || s.zIdio == null || s.residual == null) return null;
  if (Math.abs(s.zIdio) < CONFIG.idio.notable) return null;

  return {
    symbol: ctx.symbol,
    detector: "idio_z",
    sessionDate: ctx.sessionDate,
    z: round(s.zIdio, 3),
    score: 0,
    dedupeKey: dedupeKey(ctx.symbol, "idio_z", ctx.sessionDate, s.zIdio),
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
export function detectVolume(
  ctx: DetectContext,
  s: Signals,
): DetectorEvent | null {
  // a circuit-locked stock has no two-way market — volume is meaningless (spec §9)
  if (ctx.circuitState !== "none") return null;
  if (!hasHistory(ctx) || s.zVol == null || s.volToday == null) return null;
  if (s.zVol < CONFIG.volume.emitZ) return null;

  return {
    symbol: ctx.symbol,
    detector: "volume_z",
    sessionDate: ctx.sessionDate,
    z: round(s.zVol, 3),
    score: 0,
    dedupeKey: dedupeKey(ctx.symbol, "volume_z", ctx.sessionDate, s.zVol),
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
): DetectorEvent | null {
  if (!hasHistory(ctx) || s.structFlags === 0) return null;

  const flags: string[] = [];
  if (s.new252High) flags.push("new_252d_high");
  if (s.new252Low) flags.push("new_252d_low");
  if (s.gap) flags.push("overnight_gap");
  if (s.maCrossUp) flags.push("ma50_cross_up");
  if (s.maCrossDown) flags.push("ma50_cross_down");

  const z = s.gapZ ?? 0;
  return {
    symbol: ctx.symbol,
    detector: "structural",
    sessionDate: ctx.sessionDate,
    z: round(z, 3),
    score: 0,
    // structural events dedupe on the flag set, not |z|
    dedupeKey: `${ctx.symbol}:structural:${ctx.sessionDate}:${flags.join("+")}`,
    payload: {
      flags,
      gapZ: s.gapZ == null ? null : round(s.gapZ, 2),
      returnPct: round(pct(s.ret ?? 0), 2),
    },
  };
}

// ─── scoring (spec §4.7): score = 100 · sigmoid(Σ wᵢ · featureᵢ) ────────────
function sessionScore(s: Signals): number {
  const w = CONFIG.score.weights;
  const sum =
    w.idio * Math.abs(s.zIdio ?? 0) +
    w.vol * Math.max(0, (s.zVol ?? 0) - 1) +
    w.struct * s.structFlags +
    w.news * 0; // news detector is Phase 7
  return 100 * sigmoid(sum);
}

// ─── the engine ─────────────────────────────────────────────────────────────
export const DETECTORS = [
  detectReturnZ,
  detectIdiosyncratic,
  detectVolume,
  detectStructural,
] as const;

/**
 * Run every detector for one session of one symbol. Pure — returns the events
 * to persist. Dedupe/cooldown against existing rows happens in the engine
 * layer (it needs the DB), keyed on `dedupeKey`.
 */
export function detectSymbol(ctx: DetectContext): DetectorEvent[] {
  const signals = computeSignals(ctx);
  const score = round(sessionScore(signals), 1);

  const events: DetectorEvent[] = [];
  for (const detector of DETECTORS) {
    const e = detector(ctx, signals);
    if (e) {
      e.score = score;
      events.push(e);
    }
  }
  return events.filter((e) => e.score >= CONFIG.score.minToEmit);
}
