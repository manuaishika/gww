"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import { TrendingPreview } from "./trending-preview";
import type { SectorGroup } from "./types";

/**
 * The Discover tab — always available, not just on the first screen. What the
 * detector engine found recently, plus browse-by-sector to add things you
 * aren't watching yet.
 */
export function DiscoverView({ onChanged }: { onChanged: () => void }) {
  const [sectors, setSectors] = useState<SectorGroup[] | null>(null);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.universe().then((r) => setSectors(r.sectors)).catch(() => setSectors([]));
  useEffect(() => {
    load();
  }, []);

  async function toggle(symbol: string, onWatchlist: boolean) {
    setBusy(symbol);
    try {
      if (onWatchlist) await api.remove(symbol);
      else await api.add(symbol);
      await load();
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <TrendingPreview onAdded={onChanged} />

      <div>
        <p className="mb-2 text-[13px] font-medium text-ink">Browse by sector</p>
        {sectors == null ? (
          <p className="text-[12.5px] text-slate">loading…</p>
        ) : (
          <div className="divide-y divide-ink/10 rounded-sm border border-ink/10">
            {sectors.map((g) => {
              const open = openSector === g.sector;
              const watched = g.symbols.filter((s) => s.onWatchlist).length;
              return (
                <div key={g.sector}>
                  <button
                    type="button"
                    onClick={() => setOpenSector(open ? null : g.sector)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13.5px] hover:bg-ink/[0.02]"
                  >
                    <span className="font-medium text-ink">{g.sector}</span>
                    <span className="text-[12px] text-slate">
                      {g.symbols.length} {g.symbols.length === 1 ? "name" : "names"}
                      {watched > 0 && ` · ${watched} watched`}
                      <span className="ml-2">{open ? "▾" : "▸"}</span>
                    </span>
                  </button>
                  {open && (
                    <ul className="bg-ink/[0.015] px-3 py-1.5">
                      {g.symbols.map((s) => (
                        <li
                          key={s.symbol}
                          className="flex items-center justify-between py-1.5 text-[13px]"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-ink">{s.symbol}</span>
                            <span className="ml-2 text-slate">{s.name}</span>
                            {s.currency !== "INR" && (
                              <span className="ml-1.5 text-[11px] text-slate">
                                {s.exchange}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggle(s.symbol, s.onWatchlist)}
                            disabled={busy === s.symbol}
                            className={
                              "shrink-0 text-[11.5px] disabled:opacity-40 " +
                              (s.onWatchlist
                                ? "text-slate hover:text-amber"
                                : "text-signal hover:underline")
                            }
                          >
                            {busy === s.symbol
                              ? "…"
                              : s.onWatchlist
                                ? "watching · remove"
                                : "+ watch"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
