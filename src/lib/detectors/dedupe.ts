/**
 * Deduplication and cooldown. Both are pure.
 *
 * One event per (symbol, session). dedupeKey: re-running the detector over the
 * same session produces the same key, so a unique constraint on
 * `events.dedupe_key` makes ingestion idempotent. A real escalation
 * (|z| 2.1 → 3.4) crosses an integer floor and produces a NEW key, so it isn't
 * swallowed.
 */
import { CONFIG } from "./config";

export function dedupeKey(symbol: string, sessionDate: string, z: number): string {
  return `${symbol}:${sessionDate}:${Math.floor(Math.abs(z))}`;
}

/**
 * Given the most recent prior event for the same symbol that falls WITHIN the
 * cooldown window (the engine selects it using the session calendar), should
 * the new candidate be suppressed?
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
