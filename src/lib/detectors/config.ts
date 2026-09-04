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

  /**
   * score = 100 · sigmoid(Σ wᵢ · featureᵢ)  — spec §4.7
   * Weights are calibrated so the sigmoid works in its responsive range: a
   * lone 2σ idio move ≈ 73, 3σ ≈ 82, 5σ ≈ 92, and co-occurring volume /
   * structural signals push toward 100. The volume term is capped so one
   * freak print (z = 30) can't dominate the ranking on its own.
   */
  score: {
    weights: { idio: 0.5, ret: 0.28, vol: 0.16, struct: 0.32, news: 0.4 },
    volContributionCap: 6, // max of (z_vol − 1) that counts
    minToEmit: 0, // an event that cleared a detector threshold is worth a row
  },

  /** One event per (symbol, session). It can't refire within N sessions unless
   *  the peak |z| grew by ≥ escalationZ. */
  cooldown: {
    sessions: 3,
    escalationZ: 1.0,
  },
} as const;

export type Config = typeof CONFIG;
