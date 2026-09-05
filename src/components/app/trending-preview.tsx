"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import { describeSignal, signalPct } from "./card-copy";
import { pct } from "./format";
import type { TrendingItem } from "./types";

/**
 * A global preview of the detector engine's own real output, for a visitor
 * with no watchlist yet — the first screen should show what the product
 * actually finds, not just tell you to go add something (spec §10's "an
 * empty watchlist says what to do next" extended one step further: it should
 * also show proof the thing works before you commit to anything).
 */
export function TrendingPreview({ onAdded }: { onAdded: () => void }) {
  const [items, setItems] = useState<TrendingItem[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.trending().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  async function watch(symbol: string) {
    setAdding(symbol);
    try {
      await api.add(symbol);
      setAdded((prev) => new Set(prev).add(symbol));
      onAdded();
    } finally {
      setAdding(null);
    }
  }

  if (items == null) {
    return <p className="text-[12.5px] text-slate">checking what moved recently…</p>;
  }
  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="mb-2 text-[13px] font-medium text-ink">
        What the detector found this week
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const headline = signalPct(item.payload);
          const up = (headline ?? 0) >= 0;
          const isAdded = added.has(item.symbol);
          return (
            <div
              key={item.symbol}
              className="flex items-start justify-between gap-3 rounded-sm border border-ink/10 p-3"
            >
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-ink">
                  {item.name}{" "}
                  <span className="font-normal text-slate">
                    {item.symbol}
                    {item.currency !== "INR" && ` · ${item.currency}`}
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] text-slate">
                  {describeSignal(item.detector, item.z, item.payload)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="whitespace-nowrap text-[13px] font-semibold text-ink">
                  <span className="mr-1 text-slate" aria-hidden>
                    {up ? "▲" : "▼"}
                  </span>
                  {pct(headline)}
                </span>
                <button
                  type="button"
                  onClick={() => watch(item.symbol)}
                  disabled={adding === item.symbol || isAdded}
                  className="text-[11.5px] text-signal hover:underline disabled:text-slate disabled:no-underline"
                >
                  {isAdded ? "watching" : adding === item.symbol ? "…" : "+ watch"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
