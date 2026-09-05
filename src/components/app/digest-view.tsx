"use client";

import { useState } from "react";
import { AbsenceChart } from "./absence-chart";
import { headlinePct, whyLine } from "./card-copy";
import { DecompositionBar } from "./decomposition-bar";
import { dirText, pct } from "./format";
import { useSymbolDetail } from "./symbol-detail";
import { ZContextStrip } from "./z-context-strip";
import type { Digest, DigestEvent } from "./types";

// Weight and position encode materiality — the top card is larger
// and heavier; by rank 3-4 it's reading like a footnote, not a duplicate card.
const SCALE = [
  { title: "text-2xl sm:text-[26px]", pad: "p-6", accent: "border-l-[3px] border-signal", figure: "text-2xl", bg: "bg-signal/[0.035]" },
  { title: "text-xl", pad: "p-5", accent: "border-l-2 border-signal/60", figure: "text-xl", bg: "bg-paper" },
  { title: "text-lg", pad: "p-4", accent: "border-l border-ink/15", figure: "text-lg", bg: "bg-paper" },
  { title: "text-base", pad: "p-4", accent: "border-l border-ink/15", figure: "text-base", bg: "bg-paper" },
  { title: "text-base", pad: "p-3.5", accent: "border-l border-ink/10", figure: "text-base", bg: "bg-paper" },
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

  // Just started watching — nothing has happened "since," so show what the
  // engine already flagged for these names recently, clearly labelled.
  if (digest.headlines.length === 0 && digest.lookback.length > 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-dashed border-ink/15 px-4 py-3">
          <p className="text-[13.5px] text-ink">
            Nothing since you started watching. What moved for these in the last
            few weeks:
          </p>
        </div>
        {digest.lookback.map((e, i) => (
          <Card
            key={e.id}
            event={e}
            windowLabel="in the recent window"
            scale={SCALE[Math.min(i, SCALE.length - 1)]}
            onDismiss={() => onDismiss(e.id)}
            busy={busyId === e.id}
          />
        ))}
      </div>
    );
  }

  if (digest.headlines.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink/15 px-6 py-10 text-center">
        <p className="text-[15px] text-ink">Quiet. Nothing crossed the bar.</p>
        <p className="mt-1 text-[13px] text-slate">
          Every move {digest.windowLabel} stayed inside its own normal range.
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
          windowLabel={digest.windowLabel}
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
  windowLabel,
  scale,
  onDismiss,
  busy,
}: {
  event: DigestEvent;
  windowLabel: string;
  scale: (typeof SCALE)[number];
  onDismiss: () => void;
  busy: boolean;
}) {
  const [showChart, setShowChart] = useState(false);
  const openDetail = useSymbolDetail();
  const headline = headlinePct(event);
  const up = (headline ?? 0) >= 0;

  return (
    <article
      className={`overflow-hidden rounded-sm ${scale.bg} ${scale.accent} ${scale.pad} shadow-[0_1px_0_rgba(20,22,25,0.06)]`}
    >
      {/* materiality, as a thin bar — weight encodes how much it matters */}
      <div className="mb-2.5 h-[3px] w-full rounded-full bg-ink/[0.06]">
        <div
          className="h-full rounded-full bg-signal/70"
          style={{ width: `${Math.max(4, Math.min(100, event.score))}%` }}
          aria-hidden
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={`${scale.title} font-semibold leading-snug text-ink`}>
            <button
              type="button"
              onClick={() => openDetail(event.symbol)}
              className="text-left hover:underline"
            >
              {event.name}
            </button>{" "}
            <span className="font-normal text-slate">
              {event.symbol}
              {event.currency !== "INR" && ` · ${event.currency}`}
            </span>
          </h3>
          <p className="mt-1 text-[13px] text-slate">{whyLine(event)}</p>
        </div>

        <div className="flex shrink-0 items-start gap-3">
          <div className={`${scale.figure} whitespace-nowrap font-semibold ${dirText(headline)}`}>
            <span className="mr-1" aria-hidden>
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
        <div className="mt-3">
          <p className="text-[12.5px] text-slate">
            {windowLabel} ({sinceLabel(event.sinceLastSeen.sessions)})
            {event.positionBonus > 0 && (
              <span className="ml-2 text-[11px] text-signal">
                · ranked up {event.positionBonus.toFixed(1)}pt for position size
              </span>
            )}
          </p>
          <div className="mt-1.5 max-w-sm">
            <DecompositionBar
              marketPct={event.sinceLastSeen.marketPct}
              companyPct={event.sinceLastSeen.companyPct}
            />
          </div>
        </div>
      )}

      {event.thesis && (
        <p className="mt-2 border-l-2 border-ink/10 pl-3 text-[13px] italic text-ink/80">
          &ldquo;{event.thesis}&rdquo;
        </p>
      )}

      {event.chart && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowChart((v) => !v)}
            className="text-[11.5px] text-slate hover:text-ink"
          >
            {showChart ? "▾ hide chart" : "▸ show 60-day chart"}
          </button>
          {showChart && (
            <div className="mt-2 max-w-sm space-y-2">
              <AbsenceChart
                closes={event.chart.closes}
                watermarkDate={event.chart.watermarkDate}
              />
              <ZContextStrip zHistory={event.chart.zHistory} currentZ={event.z} />
              <p className="text-[10.5px] text-slate">
                shaded: since you last checked · dot: this move against the last{" "}
                {event.chart.zHistory.length} daily moves
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// Horizon is capped at 20 sessions (src/lib/detectors/config.ts) so a very
// long absence doesn't read as one enormous, meaningless move.
const HORIZON_CAP_SESSIONS = 20;

function sinceLabel(sessions: number): string {
  if (sessions >= HORIZON_CAP_SESSIONS) return "showing the last month";
  return `${sessions} ${sessions === 1 ? "session" : "sessions"}`;
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
