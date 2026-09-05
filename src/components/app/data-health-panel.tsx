"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import type { DataHealth } from "./types";

/**
 * "Makes the system look operated rather than assembled" (spec §7). Global,
 * not per-user. Collapsed by default — this is for someone who goes looking,
 * not a thing to compete with the digest for attention.
 */
export function DataHealthPanel() {
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.dataHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  if (!health) return null;

  return (
    <div className="mt-6 border-t border-ink/10 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12.5px] text-slate hover:text-ink"
      >
        {open ? "▾" : "▸"} data health — {health.sources.secondary ? "2 sources" : "1 source"},{" "}
        {health.disputes.length} disputed, {health.circuitLocked.length} circuit-locked
      </button>

      {open && (
        <div className="mt-3 space-y-2 text-[12.5px] text-slate">
          <p>
            Primary: <span className="text-ink">{health.sources.primary}</span>. Secondary:{" "}
            <span className="text-ink">{health.sources.secondary ?? "not configured"}</span>
            {!health.sources.secondary && " — set FINNHUB_API_KEY to enable (optional, spec §7)"}.
          </p>
          <p>
            {health.totalQuotes} quotes tracked
            {health.lastFetchedAt && `, last refreshed ${new Date(health.lastFetchedAt).toLocaleString("en-IN")}`}.
          </p>
          {health.disputes.map((d) => (
            <p key={d.symbol} className="text-amber">
              {d.symbol} disputed — {d.note}
            </p>
          ))}
          {health.circuitLocked.map((c) => (
            <p key={c.symbol} className="text-amber">
              {c.symbol} at {c.state} circuit — no two-way market, volume detector suppressed.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
