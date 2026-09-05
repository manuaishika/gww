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

export type NewsItem = { eventDate: string; kind: "results" | "headline" };

export type DetectorName =
  | "return_z"
  | "idio_z"
  | "volume_z"
  | "structural"
  | "news_density"
  | "silence";

/** A single detector's output — used by the per-detector functions and their tests. */
export type DetectorHit = {
  detector: DetectorName;
  z: number; // signed for return/idio; volume z; gap z for structural
  payload: Record<string, unknown>;
};

/**
 * What the engine actually persists: ONE row per (symbol, session). `detector`
 * is the dominant signal; `signals` carries every computed fact so the card can
 * compose from it without another query (spec §8).
 */
export type SessionEvent = {
  symbol: string;
  detector: DetectorName; // the dominant signal
  sessionDate: string;
  z: number; // the dominant signal's z
  score: number; // 0–100
  dedupeKey: string;
  signals: EventSignals;
};

export type EventSignals = {
  returnZ: number | null;
  returnPct: number | null;
  idioZ: number | null;
  totalPct: number | null;
  marketPct: number | null;
  companyPct: number | null;
  beta60: number | null;
  volumeZ: number | null;
  timesMedian: number | null;
  structural: string[];
  horizonSessions: number;
  baselineDate: string;
  newsCount: number | null; // headlines/results in the detection window
  isSilence: boolean; // a news/results event with no repricing (spec §4.6)
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
  /** News/results dates up to and including `sessionDate`, ascending. Optional
   *  detectors (§4.5, §4.6) — an empty array just means neither can fire. */
  newsEvents: NewsItem[];
};
