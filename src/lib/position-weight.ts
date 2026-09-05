/**
 * Position size (spec addendum) is one optional number per watchlist item —
 * shares/units held, no valuation, no broker link, no OAuth, no credentials.
 * It nudges ranking at DIGEST time; it never touches the shared `events.score`
 * column (the scaling story is: detection is shared across users, only
 * read-state and preference are personal — see README architecture).
 *
 * "A 3-sigma move in something you barely hold shouldn't outrank nothing" —
 * meaning it should still outrank a real signal in something you don't hold.
 * The bonus is small, bounded and saturating: a huge position with a trivial
 * move can never leapfrog a genuine signal in something you hold little of.
 */
const MAX_BONUS = 8; // points, on the 0–100 score scale
const REFERENCE_SIZE = 100; // a position this big earns about half the max bonus

export function positionBonus(positionSize: number | null | undefined): number {
  if (positionSize == null || !Number.isFinite(positionSize) || positionSize <= 0) {
    return 0;
  }
  return MAX_BONUS * (positionSize / (positionSize + REFERENCE_SIZE));
}

export function effectiveScore(
  score: number,
  positionSize: number | null | undefined,
): number {
  return score + positionBonus(positionSize);
}
