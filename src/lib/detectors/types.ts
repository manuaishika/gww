export type Bar = {
  sessionDate: string; // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number; // split/bonus-adjusted — all return maths uses this
  volume: number;
};

export type CircuitState = "none" | "upper" | "lower";

/** Precomputed once per session per symbol (spec §4, stored in stats_daily). */
export type SymbolStats = {
  sigma60: number | null;
  beta60: number | null;
  residSigma60: number | null;
  volMedian30: number | null;
  volMad30: number | null;
  high252: number | null;
  low252: number | null;
  sessionsAvailable: number;
};

export type DetectorName = "return_z" | "idio_z" | "volume_z" | "structural";

/** A raw detector output. `score` is filled by the scorer, `dedupeKey` by the engine. */
export type DetectorEvent = {
  symbol: string;
  detector: DetectorName;
  sessionDate: string;
  z: number; // signed for return/idio; volume z; gap z for structural
  score: number; // 0–100, set by scoreEvents
  dedupeKey: string;
  payload: Record<string, unknown>;
};

/**
 * Everything a detector needs to evaluate ONE session for ONE symbol. Pure data
 * — assembled by the engine from the DB, never fetched inside a detector.
 *
 * `bars` and `indexBars` are ascending and end at (or before) `sessionDate`.
 * `horizonSessions` is how many trading sessions back the baseline is — 1 for
 * per-session detection, more for a "since you last checked" digest summary.
 */
export type DetectContext = {
  symbol: string;
  sessionDate: string;
  bars: Bar[];
  indexBars: Bar[];
  stats: SymbolStats;
  horizonSessions: number;
  circuitState: CircuitState;
};
