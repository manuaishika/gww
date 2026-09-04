"use client";

import { headlinePct, whyLine } from "./card-copy";
import { pct } from "./format";
import type { Digest, DigestEvent } from "./types";

// Weight and position encode materiality (spec §10) — the top card is larger
// and heavier; by rank 3-4 it's reading like a footnote, not a duplicate card.
const SCALE = [
  { title: "text-2xl sm:text-[26px]", pad: "p-6", accent: "border-l-[3px] border-signal", figure: "text-2xl" },
  { title: "text-xl", pad: "p-5", accent: "border-l-2 border-signal/60", figure: "text-xl" },
  { title: "text-lg", pad: "p-4", accent: "border-l border-ink/15", figure: "text-lg" },
  { title: "text-base", pad: "p-4", accent: "border-l border-ink/15", figure: "text-base" },
  { title: "text-base", pad: "p-3.5", accent: "border-l border-ink/10", figure: "text-base" },
] as const;

export function DigestView({
  digest,
  onDismiss,
  busyId,
}: {
  digest: Digest;
  onDismiss: (eventId: string) => void;
  busyId: string | null;
}) {
  if (digest.watching === 0) return null;

  if (digest.headlines.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink/15 px-6 py-10 text-center">
        <p className="text-[15px] text-ink">Quiet. Nothing crossed the bar.</p>
        <p className="mt-1 text-[13px] text-slate">
          Every move since you last checked stayed inside normal range for its
          own volatility.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {digest.headlines.map((e, i) => (
        <Card
          key={e.id}
          event={e}
          scale={SCALE[Math.min(i, SCALE.length - 1)]}
          onDismiss={() => onDismiss(e.id)}
          busy={busyId === e.id}
        />
      ))}
      <QuieterLine quieter={digest.quieter} />
    </div>
  );
}

function Card({
  event,
  scale,
  onDismiss,
  busy,
}: {
  event: DigestEvent;
  scale: (typeof SCALE)[number];
  onDismiss: () => void;
  busy: boolean;
}) {
  const headline = headlinePct(event);
  const up = (headline ?? 0) >= 0;

  return (
    <article
      className={`rounded-sm bg-paper ${scale.accent} ${scale.pad} shadow-[0_1px_0_rgba(20,22,25,0.06)]`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={`${scale.title} font-semibold leading-snug text-ink`}>
            {event.name}{" "}
            <span className="font-normal text-slate">{event.symbol}</span>
          </h3>
          <p className="mt-1 text-[13px] text-slate">{whyLine(event)}</p>
        </div>

        <div className="flex shrink-0 items-start gap-3">
          <div className={`${scale.figure} whitespace-nowrap font-semibold text-ink`}>
            <span className="mr-1 text-slate" aria-hidden>
              {up ? "▲" : "▼"}
            </span>
            {pct(headline)}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            aria-label="Dismiss"
            title="Mark as read"
            className="mt-0.5 text-slate transition hover:text-ink disabled:opacity-40"
          >
            ×
          </button>
        </div>
      </div>

      {event.sinceLastSeen && (
        <p className="mt-2 text-[12.5px] text-slate">
          since you checked ({event.sinceLastSeen.sessions}{" "}
          {event.sinceLastSeen.sessions === 1 ? "session" : "sessions"}): {pct(event.sinceLastSeen.totalPct)}{" "}
          total — {pct(event.sinceLastSeen.marketPct)} market, {pct(event.sinceLastSeen.companyPct)} company
        </p>
      )}

      {event.thesis && (
        <p className="mt-2 border-l-2 border-ink/10 pl-3 text-[13px] italic text-ink/80">
          &ldquo;{event.thesis}&rdquo;
        </p>
      )}
    </article>
  );
}

function QuieterLine({ quieter }: { quieter: Digest["quieter"] }) {
  if (quieter.count === 0) return null;
  const top = quieter.symbols.slice(0, 4).map((s) => s.symbol);
  const extra = quieter.symbols.length - top.length;

  return (
    <p className="px-1 pt-2 text-[13px] text-slate">
      {quieter.count} smaller {quieter.count === 1 ? "change" : "changes"} across{" "}
      {quieter.symbols.length} {quieter.symbols.length === 1 ? "symbol" : "symbols"}
      {top.length > 0 && (
        <>
          {" "}
          ({top.join(", ")}
          {extra > 0 ? `, +${extra} more` : ""})
        </>
      )}
      . The digest is capped at 5 — a watchlist that surfaces everything has
      surfaced nothing.
    </p>
  );
}
