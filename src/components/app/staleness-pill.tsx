"use client";

import { classifyQuote, stalenessLabel, type QuoteLike } from "@/lib/staleness";

/** amber is reserved ONLY for stale/disputed data (spec §10). */
export function StalenessPill({ quote }: { quote: QuoteLike | null }) {
  const s = classifyQuote(quote);
  const dimmed = s.kind === "stale" || s.kind === "no_data";
  const amber = s.kind === "stale" || quote?.isDisputed;

  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[11.5px] " +
        (amber ? "text-amber" : dimmed ? "text-slate/70" : "text-slate")
      }
      title={quote?.source ? `source: ${quote.source}` : undefined}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          s.kind === "live" ? "bg-signal" : amber ? "bg-amber" : "bg-slate/50"
        }`}
        aria-hidden
      />
      {stalenessLabel(s)}
      {quote?.isDisputed ? " · disputed" : ""}
    </span>
  );
}
