import { flagLabel, signed } from "./format";
import type { DigestEvent, EventSignals } from "./types";

/**
 * Template-composed card copy (spec §8) — no LLM. Every number comes from the
 * detector engine; this just turns the payload into one readable sentence.
 *
 * `describeSignal` is the reusable base (detector + z + payload only) — the
 * trending preview (no watchlist, no watermark, no cluster context yet) uses
 * it directly; `whyLine` adds the digest-only context (sector clustering).
 */
export function describeSignal(
  detector: string,
  z: number,
  s: EventSignals,
): string {
  switch (detector) {
    case "idio_z": {
      if (s.totalPct == null || s.marketPct == null || s.companyPct == null) break;
      return `${signed(s.totalPct)}% total — ${signed(s.marketPct)}% was the market, ${signed(s.companyPct)}% was the company.`;
    }
    case "return_z": {
      if (s.returnPct == null) break;
      return `${signed(s.returnPct)}% move — ${Math.abs(z).toFixed(1)}σ for this stock, ${sessionsLabel(s.horizonSessions)}.`;
    }
    case "volume_z": {
      if (s.timesMedian == null) break;
      const move = s.returnPct != null ? `, ${signed(s.returnPct)}% on the session` : "";
      return `${s.timesMedian}× median volume${move}.`;
    }
    case "structural": {
      if (s.structural.length === 0) break;
      const flags = s.structural.map(flagLabel).join(", ");
      return flags.charAt(0).toUpperCase() + flags.slice(1) + ".";
    }
    case "news_density": {
      if (s.newsCount == null) break;
      return `${s.newsCount} headlines this week, no repricing yet.`;
    }
    case "silence":
      return "Results were out recently. The stock hasn't moved — either the market already knew, or nobody's looked yet.";
  }
  return `${Math.abs(z).toFixed(1)}σ move for this stock.`;
}

export function whyLine(e: DigestEvent): string {
  // A one-factor model can't tell "this company" from "this sector" apart.
  // When ≥3 watched holdings in the same sector move together, say that
  // plainly instead of overclaiming company-specific insight (spec §9-style
  // honesty, applied to the model itself, not just the data).
  if (e.sectorCluster) {
    const others = e.sectorCluster.symbols.filter((s2) => s2 !== e.symbol);
    return (
      `Moved with ${others.length} other ${e.sectorCluster.sector} holding${others.length === 1 ? "" : "s"} ` +
      `(${others.join(", ")}) — likely sector-wide, not company-specific.`
    );
  }
  return describeSignal(e.detector, e.z, e.payload);
}

function sessionsLabel(h: number): string {
  const n = Math.round(h);
  return n <= 1 ? "over the session" : `over ${n} sessions`;
}

/** Primary headline % for a card: prefer the since-you-checked total. */
export function headlinePct(e: DigestEvent): number | null {
  return e.sinceLastSeen?.totalPct ?? e.payload.totalPct ?? e.payload.returnPct ?? null;
}

/** Same idea, for a bare signal with no digest context (trending preview). */
export function signalPct(s: EventSignals): number | null {
  return s.totalPct ?? s.returnPct ?? null;
}
