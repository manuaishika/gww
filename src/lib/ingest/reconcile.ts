/**
 * Reconciling two price sources. Pure — no I/O, no clock other than
 * what's passed in. If the sources differ by more than the threshold, don't
 * silently pick one: flag it, show both, prefer the fresher exchange_ts, log
 * why.
 */
export type SourceQuote = { price: number; source: string; exchangeTs: Date };

export type Reconciled = {
  price: number;
  source: string;
  exchangeTs: Date;
  isDisputed: boolean;
  disputeNote: string | null;
};

const DISAGREEMENT_THRESHOLD_PCT = 0.5;

export function reconcileQuotes(
  primary: SourceQuote,
  secondary: SourceQuote | null,
): Reconciled {
  if (!secondary) {
    return {
      price: primary.price,
      source: primary.source,
      exchangeTs: primary.exchangeTs,
      isDisputed: false,
      disputeNote: null,
    };
  }

  const diffPct =
    (Math.abs(primary.price - secondary.price) /
      Math.max(primary.price, secondary.price)) *
    100;

  if (diffPct <= DISAGREEMENT_THRESHOLD_PCT) {
    // close enough — prefer whichever is fresher, no dispute flag
    const newer = secondary.exchangeTs > primary.exchangeTs ? secondary : primary;
    return {
      price: newer.price,
      source: newer.source,
      exchangeTs: newer.exchangeTs,
      isDisputed: false,
      disputeNote: null,
    };
  }

  const newer = secondary.exchangeTs > primary.exchangeTs ? secondary : primary;
  const older = newer === primary ? secondary : primary;
  return {
    price: newer.price,
    source: newer.source,
    exchangeTs: newer.exchangeTs,
    isDisputed: true,
    disputeNote:
      `${newer.source} ₹${newer.price} vs ${older.source} ₹${older.price} ` +
      `(${diffPct.toFixed(2)}% apart) — showing ${newer.source} (newer exchange_ts).`,
  };
}
