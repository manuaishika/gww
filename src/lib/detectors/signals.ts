/**
 * computeSignals — the single pass over a DetectContext that extracts every
 * feature the four detectors and the scorer need. Pure. Detectors read from
 * this; they never recompute from bars themselves.
 */
import { CONFIG } from "./config";
import { clamp } from "./math";
import type { DetectContext } from "./types";

export type Signals = {
  horizon: number; // clamped h used in √h
  baselineDate: string;

  ret: number | null; // log return over the horizon, on adjClose
  zRet: number | null;

  rIndex: number | null; // index log return over the same span
  marketLogRet: number | null; // β · rIndex
  residual: number | null; // ret − β · rIndex
  zIdio: number | null;

  volToday: number | null;
  zVol: number | null;

  new252High: boolean;
  new252Low: boolean;
  gapZ: number | null;
  gap: boolean;
  maCrossUp: boolean;
  maCrossDown: boolean;
  structFlags: number;

  newsCountWindow: number; // dated events in the trailing news window
  newsDensityFlag: boolean; // §4.5
  daysSinceNews: number | null;
  silenceFlag: boolean; // §4.6
};

const indexCloseOn = (
  indexBars: DetectContext["indexBars"],
  date: string,
): number | null => {
  for (let i = indexBars.length - 1; i >= 0; i--) {
    if (indexBars[i].sessionDate === date) return indexBars[i].adjClose;
  }
  return null;
};

export function computeSignals(ctx: DetectContext): Signals {
  const { bars, indexBars, stats } = ctx;
  const h = CONFIG.history;
  const last = bars.length - 1;

  const horizon = clamp(
    ctx.horizonSessions,
    CONFIG.horizon.minSessions,
    CONFIG.horizon.maxSessions,
  );
  const back = Math.max(1, Math.round(ctx.horizonSessions));
  const baseIdx = Math.max(0, last - back);
  const baselineDate = bars[baseIdx]?.sessionDate ?? bars[0].sessionDate;
  const sqrtH = Math.sqrt(horizon);

  const out: Signals = {
    horizon,
    baselineDate,
    ret: null,
    zRet: null,
    rIndex: null,
    marketLogRet: null,
    residual: null,
    zIdio: null,
    volToday: bars[last]?.volume ?? null,
    zVol: null,
    new252High: false,
    new252Low: false,
    gapZ: null,
    gap: false,
    maCrossUp: false,
    maCrossDown: false,
    structFlags: 0,
    newsCountWindow: 0,
    newsDensityFlag: false,
    daysSinceNews: null,
    silenceFlag: false,
  };

  if (bars.length < 2) return out;

  const pxNow = bars[last].adjClose;
  const pxBase = bars[baseIdx].adjClose;
  const ret = Math.log(pxNow / pxBase);
  out.ret = ret;

  // --- return z ---
  if (stats.sigma60 && stats.sigma60 > 0) {
    out.zRet = ret / (stats.sigma60 * sqrtH);
  }

  // --- idiosyncratic z ---
  if (stats.beta60 != null && stats.residSigma60 && stats.residSigma60 > 0) {
    const idxNow = indexCloseOn(indexBars, bars[last].sessionDate);
    const idxBase = indexCloseOn(indexBars, baselineDate);
    if (idxNow != null && idxBase != null && idxBase > 0) {
      const rIndex = Math.log(idxNow / idxBase);
      const marketLogRet = stats.beta60 * rIndex;
      const residual = ret - marketLogRet;
      out.rIndex = rIndex;
      out.marketLogRet = marketLogRet;
      out.residual = residual;
      out.zIdio = residual / (stats.residSigma60 * sqrtH);
    }
  }

  // --- volume z (median / MAD) ---
  if (
    stats.volMedian30 != null &&
    stats.volMad30 != null &&
    stats.volMad30 >= CONFIG.volume.minMad &&
    out.volToday != null
  ) {
    out.zVol =
      (out.volToday - stats.volMedian30) /
      (CONFIG.volume.madScale * stats.volMad30);
  }

  // --- structural: 252-session extremes on adjClose, excluding today ---
  const prior = bars.slice(-(h.highLowWindow + 1), -1).map((b) => b.adjClose);
  if (prior.length >= 1) {
    const priorHigh = Math.max(...prior);
    const priorLow = Math.min(...prior);
    out.new252High = pxNow > priorHigh + CONFIG.structural.highLowEpsilon;
    out.new252Low = pxNow < priorLow - CONFIG.structural.highLowEpsilon;
  }

  // --- structural: overnight gap ---
  if (stats.sigma60 && stats.sigma60 > 0) {
    const prevClose = bars[last - 1].adjClose;
    const gapZ = Math.abs(Math.log(bars[last].open / prevClose)) / stats.sigma60;
    out.gapZ = gapZ;
    out.gap = gapZ > CONFIG.structural.gapZ;
  }

  // --- structural: first 50-DMA cross in ≥ maCrossLookback sessions ---
  const maCross = detectMaCross(bars.map((b) => b.adjClose), h.maWindow, h.maCrossLookback);
  out.maCrossUp = maCross === "up";
  out.maCrossDown = maCross === "down";

  out.structFlags =
    Number(out.new252High) +
    Number(out.new252Low) +
    Number(out.gap) +
    Number(out.maCrossUp || out.maCrossDown);

  // --- news density (§4.5) & silence (§4.6) ---
  const sessionMs = Date.parse(ctx.sessionDate);
  const daysAgo = (d: string) => (sessionMs - Date.parse(d)) / 86_400_000;

  const inDensityWindow = ctx.newsEvents.filter((n) => {
    const d = daysAgo(n.eventDate);
    return d >= 0 && d <= CONFIG.news.densityWindowDays;
  });
  out.newsCountWindow = inDensityWindow.length;
  out.newsDensityFlag = inDensityWindow.length >= CONFIG.news.densityMinCount;

  const recentNews = ctx.newsEvents
    .filter((n) => daysAgo(n.eventDate) >= 0)
    .sort((a, b) => Date.parse(b.eventDate) - Date.parse(a.eventDate))[0];
  if (recentNews) out.daysSinceNews = daysAgo(recentNews.eventDate);

  out.silenceFlag =
    out.daysSinceNews != null &&
    out.daysSinceNews <= CONFIG.news.silenceWindowDays &&
    out.zIdio != null &&
    Math.abs(out.zIdio) < CONFIG.news.silenceMaxAbsIdioZ;

  return out;
}

function sma(values: number[], end: number, window: number): number | null {
  const start = end - window + 1;
  if (start < 0) return null;
  let s = 0;
  for (let i = start; i <= end; i++) s += values[i];
  return s / window;
}

/** "up" if price crossed above its MA today after ≥ lookback sessions below it. */
function detectMaCross(
  px: number[],
  window: number,
  lookback: number,
): "up" | "down" | null {
  const last = px.length - 1;
  if (last - window - lookback < 0) return null;

  const sign = (i: number): number | null => {
    const m = sma(px, i, window);
    if (m == null) return null;
    return Math.sign(px[i] - m);
  };

  const today = sign(last);
  const yesterday = sign(last - 1);
  if (today == null || yesterday == null || today === 0 || today === yesterday) {
    return null;
  }
  // every one of the prior `lookback` sessions was on the same side as yesterday
  for (let i = last - lookback; i < last; i++) {
    if (sign(i) !== yesterday) return null;
  }
  return today > 0 ? "up" : "down";
}
