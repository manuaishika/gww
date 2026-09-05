"use client";

import { useState } from "react";
import { dirText, money, pct } from "./format";
import { Sparkline } from "./sparkline";
import { StalenessPill } from "./staleness-pill";
import { useSymbolDetail } from "./symbol-detail";
import type { WatchlistItem } from "./types";

// No baseline yet — watermark = added_at ("just-added symbol").
// The digest is honestly empty for it until the next session; the table says why.
function isFreshlyAdded(item: WatchlistItem): boolean {
  return item.lastSeenAt === item.addedAt;
}

export function WatchlistTable({
  items,
  onRemove,
  onSaveThesis,
  onSavePosition,
  busySymbol,
}: {
  items: WatchlistItem[];
  onRemove: (symbol: string) => void;
  onSaveThesis: (symbol: string, thesis: string) => void;
  onSavePosition: (symbol: string, size: number | null) => void;
  busySymbol: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink/15 px-6 py-10 text-center">
        <p className="text-[15px] text-ink">Nothing on your watchlist yet.</p>
        <p className="mt-1 text-[13px] text-slate">
          Search for a symbol above to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-ink/10">
      <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-ink/10 text-left text-[11.5px] uppercase tracking-wide text-slate">
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Change</th>
            <th className="px-3 py-2 font-medium">30d</th>
            <th className="px-3 py-2 font-medium">As of</th>
            <th className="px-3 py-2 font-medium">Position</th>
            <th className="px-3 py-2 font-medium">Thesis</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Row
              key={item.symbol}
              item={item}
              onRemove={() => onRemove(item.symbol)}
              onSaveThesis={(t) => onSaveThesis(item.symbol, t)}
              onSavePosition={(n) => onSavePosition(item.symbol, n)}
              busy={busySymbol === item.symbol}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  item,
  onRemove,
  onSaveThesis,
  onSavePosition,
  busy,
}: {
  item: WatchlistItem;
  onRemove: () => void;
  onSaveThesis: (thesis: string) => void;
  onSavePosition: (size: number | null) => void;
  busy: boolean;
}) {
  const openDetail = useSymbolDetail();
  const [editingThesis, setEditingThesis] = useState(false);
  const [draft, setDraft] = useState(item.thesis ?? "");
  const [editingPosition, setEditingPosition] = useState(false);
  const [posDraft, setPosDraft] = useState(item.positionSize ?? "");

  const price = item.quote?.price;
  const prevClose = item.quote?.prevClose;
  const changePct =
    price != null && prevClose != null && Number(prevClose) !== 0
      ? ((Number(price) - Number(prevClose)) / Number(prevClose)) * 100
      : null;
  const circuit = item.quote?.circuitState;

  return (
    <tr className={`border-b border-ink/5 align-top ${item.isActive ? "" : "opacity-50"}`}>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => openDetail(item.symbol)}
          className="text-left font-medium text-ink hover:underline"
        >
          {item.symbol}
        </button>
        <div className="text-[12px] text-slate">
          {item.name}
          {item.exchange !== "NSE" && ` · ${item.exchange}`}
          {!item.isActive && " · delisted"}
          {isFreshlyAdded(item) && " · watching from today"}
        </div>
      </td>
      <td className="px-3 py-2.5 tabular-nums">{money(price, item.currency)}</td>
      <td className="px-3 py-2.5 tabular-nums">
        {changePct == null ? (
          "—"
        ) : (
          <span className={dirText(changePct)}>
            <span className="mr-1" aria-hidden>
              {changePct >= 0 ? "▲" : "▼"}
            </span>
            {pct(changePct)}
          </span>
        )}
        {circuit && circuit !== "none" && (
          <span className="ml-2 rounded-sm bg-amber/10 px-1.5 py-0.5 text-[11px] text-amber">
            {circuit} circuit
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Sparkline values={item.sparkline ?? []} />
      </td>
      <td className="px-3 py-2.5">
        <StalenessPill quote={item.quote} />
      </td>
      <td className="px-3 py-2.5">
        {editingPosition ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="number"
              min={0}
              value={posDraft}
              onChange={(e) => setPosDraft(e.target.value)}
              onBlur={() => {
                const n = posDraft.trim() === "" ? null : Number(posDraft);
                onSavePosition(n != null && Number.isFinite(n) && n > 0 ? n : null);
                setEditingPosition(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="shares"
              className="w-20 rounded-sm border border-ink/15 bg-paper px-1.5 py-1 text-[13px] tabular-nums text-ink outline-none focus:border-signal"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingPosition(true)}
            className="text-left tabular-nums text-ink/80 hover:text-ink"
            title="Optional — nudges digest ranking, never overrides it"
          >
            {item.positionSize ? Number(item.positionSize).toLocaleString() : (
              <span className="text-slate">—</span>
            )}
          </button>
        )}
      </td>
      <td className="max-w-[240px] px-3 py-2.5">
        {editingThesis ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Why are you watching this?"
              className="min-h-[52px] w-full rounded-sm border border-ink/15 bg-paper px-2 py-1 text-[13px] text-ink outline-none focus:border-signal"
            />
            <div className="flex gap-2 text-[12px]">
              <button
                type="button"
                className="text-signal hover:underline"
                onClick={() => {
                  onSaveThesis(draft.trim());
                  setEditingThesis(false);
                }}
              >
                Save
              </button>
              <button
                type="button"
                className="text-slate hover:underline"
                onClick={() => {
                  setDraft(item.thesis ?? "");
                  setEditingThesis(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingThesis(true)}
            className="text-left text-[13px] text-ink/80 hover:text-ink"
          >
            {item.thesis ? (
              <span className="italic">&ldquo;{item.thesis}&rdquo;</span>
            ) : (
              <span className="text-slate">+ add a thesis</span>
            )}
          </button>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-[12px] text-slate hover:text-amber disabled:opacity-40"
        >
          remove
        </button>
      </td>
    </tr>
  );
}
