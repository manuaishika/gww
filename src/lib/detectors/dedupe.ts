/**
 * Deduplication and cooldown (spec §4.7). Both are pure.
 *
 * dedupeKey: re-running the detector over the same session produces the same
 * key, so a unique constraint on `events.dedupe_key` makes ingestion
 * idempotent. A real escalation (|z| 2.1 → 3.4) crosses an integer floor and
 * produces a NEW key, so it isn't swallowed.
 */
import { CONFIG } from "./config";
import type { DetectorName } from "./types";

export function dedupeKey(
  symbol: string,
  detector: DetectorName,
  sessionDate: string,
  z: number,
): string {
  return `${symbol}:${detector}:${sessionDate}:${Math.floor(Math.abs(z))}`;
}

/**
 * Given the most recent prior event for the same (symbol, detector) that falls
 * WITHIN the cooldown window (the engine selects it using the session
 * calendar), should the new candidate be suppressed?
 *
 * It escapes the cooldown only if |z| grew by ≥ escalationZ since that prior.
 */
export function suppressedByCooldown(
  candidateZ: number,
  priorZWithinWindow: number | null,
): boolean {
  if (priorZWithinWindow == null) return false;
  const grew =
    Math.abs(candidateZ) - Math.abs(priorZWithinWindow) >= CONFIG.cooldown.escalationZ;
  return !grew;
}
