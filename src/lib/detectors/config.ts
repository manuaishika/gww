/**
 * Every number the detector engine uses. Nothing numeric is hardcoded inside a
 * detector function — if you're tuning behaviour, it's in here. (spec §4)
 *
 * The "sensitivity dial" (Phase 8) is a multiplier over `score.weights`.
 */
export const CONFIG = {
  /** Look-back windows, in trading sessions. */
  history: {
    sigmaWindow: 60, // stdev of daily log returns
    betaWindow: 60, // cov(stock, index) / var(index)
    volumeWindow: 30, // median + MAD of volume
    highLowWindow: 252, // ~one trading year
    maWindow: 50, // moving average for the cross detector
    maCrossLookback: 20, // "first cross in ≥ N sessions"
    minSessionsForStats: 60, // insufficient-history guard (spec §9)
  },

  /** Horizon = trading sessions between the baseline and the session evaluated. */
  horizon: {
    minSessions: 0.25, // intraday floor so √h doesn't explode (spec §4.1)
    maxSessions: 20, // very-long-absence cap: √h saturates otherwise (spec §9)
  },

  /** |z| thresholds. `notable` fires an event; `strong` labels it. */
  returnZ: { notable: 2, strong: 3 },
  idio: { notable: 2, strong: 3 },

  volume: {
    madScale: 1.4826, // MAD → σ-equivalent for a normal distribution
    emitZ: 3, // a volume event needs a real spike, not z > 1
    minMad: 1e-6, // guard: zero-volume / constant-volume history (spec §9)
  },

  structural: {
    gapZ: 2, // |ln(open / prevClose)| / σ₆₀ over this = an overnight gap
    highLowEpsilon: 1e-9, // strict-greater guard for float compares
  },

  /** score = 100 · sigmoid(Σ wᵢ · featureᵢ)  — spec §4.7 */
  score: {
    weights: { idio: 1.0, vol: 0.35, struct: 0.6, news: 0.5 },
    minToEmit: 20, // below this an event isn't worth a row
  },

  /** Same (symbol, detector) can't refire within N sessions unless |z| grew. */
  cooldown: {
    sessions: 3,
    escalationZ: 1.0,
  },
} as const;

export type Config = typeof CONFIG;
