/**
 * computeStats — turns a symbol's bar history (+ the index) into the row that
 * goes in `stats_daily`. Pure. Run once per session per symbol (spec §4).
 *
 * Everything is on adjusted close so a split doesn't read as a 90% crash.
 */
import { CONFIG } from "./config";
import { covariance, mad, median, stdev, variance } from "./math";
import type { Bar, SymbolStats } from "./types";

const EMPTY = (sessionsAvailable: number): SymbolStats => ({
  sigma60: null,
  beta60: null,
  residSigma60: null,
  volMedian30: null,
  volMad30: null,
  high252: null,
  low252: null,
  sessionsAvailable,
});

/**
 * @param bars       ascending daily bars for the symbol
 * @param indexBars  ascending daily bars for ^NSEI, any date coverage
 */
export function computeStats(bars: Bar[], indexBars: Bar[]): SymbolStats {
  const h = CONFIG.history;
  const n = bars.length;
  if (n < 2) return EMPTY(n);

  const px = bars.map((b) => b.adjClose);

  // --- σ₆₀: stdev of daily log returns over the last `sigmaWindow` sessions ---
  const rets: number[] = [];
  for (let i = 1; i < px.length; i++) rets.push(Math.log(px[i] / px[i - 1]));
  const sigmaRets = rets.slice(-h.sigmaWindow);
  const sigma60 = sigmaRets.length >= 2 ? stdev(sigmaRets) : null;

  // --- β₆₀ and resid σ: paired stock/index returns over the same sessions ---
  const idxByDate = new Map(indexBars.map((b) => [b.sessionDate, b.adjClose]));
  const pairedStock: number[] = [];
  const pairedIndex: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const i0 = idxByDate.get(bars[i - 1].sessionDate);
    const i1 = idxByDate.get(bars[i].sessionDate);
    if (i0 == null || i1 == null) continue;
    pairedStock.push(Math.log(px[i] / px[i - 1]));
    pairedIndex.push(Math.log(i1 / i0));
  }
  const rs = pairedStock.slice(-h.betaWindow);
  const ri = pairedIndex.slice(-h.betaWindow);

  let beta60: number | null = null;
  let residSigma60: number | null = null;
  if (rs.length >= 2) {
    const varIndex = variance(ri);
    if (varIndex > 0) {
      beta60 = covariance(rs, ri) / varIndex;
      const residuals = rs.map((r, k) => r - (beta60 as number) * ri[k]);
      residSigma60 = stdev(residuals);
    }
  }

  // --- volume: median + MAD over the `volumeWindow` sessions BEFORE the last
  //     one. The baseline must be trailing — including the current session's
  //     volume lets a single spike poison its own reference (a constant history
  //     + one spike gives MAD = 0). ---
  const vols = bars.slice(-(h.volumeWindow + 1), -1).map((b) => b.volume);
  const volMedian30 = vols.length ? median(vols) : null;
  const volMad30 = vols.length ? mad(vols) : null;

  // --- 252-session extremes, on adjusted close ---
  const window = bars.slice(-h.highLowWindow).map((b) => b.adjClose);
  const high252 = window.length ? Math.max(...window) : null;
  const low252 = window.length ? Math.min(...window) : null;

  return {
    sigma60,
    beta60,
    residSigma60,
    volMedian30,
    volMad30,
    high252,
    low252,
    sessionsAvailable: n,
  };
}
