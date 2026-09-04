import { flagLabel, signed } from "./format";
import type { DigestEvent } from "./types";

/**
 * Template-composed card copy (spec §8) — no LLM. Every number comes from the
 * detector engine; this just turns the payload into one readable sentence.
 */
export function whyLine(e: DigestEvent): string {
  const s = e.payload;
  switch (e.detector) {
    case "idio_z": {
      if (s.totalPct == null || s.marketPct == null || s.companyPct == null) break;
      return `${signed(s.totalPct)}% total — ${signed(s.marketPct)}% was the market, ${signed(s.companyPct)}% was the company.`;
    }
    case "return_z": {
      if (s.returnPct == null) break;
      return `${signed(s.returnPct)}% move — ${Math.abs(e.z).toFixed(1)}σ for this stock, ${sessionsLabel(s.horizonSessions)}.`;
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
  }
  return `${Math.abs(e.z).toFixed(1)}σ move for this stock.`;
}

function sessionsLabel(h: number): string {
  const n = Math.round(h);
  return n <= 1 ? "over the session" : `over ${n} sessions`;
}

/** Primary headline % for a card: prefer the since-you-checked total. */
export function headlinePct(e: DigestEvent): number | null {
  return e.sinceLastSeen?.totalPct ?? e.payload.totalPct ?? e.payload.returnPct ?? null;
}
