"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "./api-client";
import { AbsenceChart } from "./absence-chart";
import { describeSignal } from "./card-copy";
import { dirText, money, pct, signed } from "./format";
import { StalenessPill } from "./staleness-pill";
import type { SymbolDetail } from "./types";

const Ctx = createContext<(symbol: string) => void>(() => {});

/** Click a company name anywhere → this opens. */
export function useSymbolDetail() {
  return useContext(Ctx);
}

export function SymbolDetailProvider({
  onChanged,
  children,
}: {
  onChanged: () => void;
  children: React.ReactNode;
}) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const open = useCallback((s: string) => setSymbol(s), []);

  return (
    <Ctx.Provider value={open}>
      {children}
      {symbol && (
        <DetailModal
          symbol={symbol}
          onClose={() => setSymbol(null)}
          onChanged={onChanged}
        />
      )}
    </Ctx.Provider>
  );
}

function DetailModal({
  symbol,
  onClose,
  onChanged,
}: {
  symbol: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<SymbolDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.symbolDetail(symbol).then(setD).catch(() => setD(null));
  }, [symbol]);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [load, onClose]);

  async function toggleWatch() {
    if (!d) return;
    setBusy(true);
    try {
      if (d.watchlist.onWatchlist) await api.remove(d.symbol);
      else await api.add(d.symbol);
      load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const change =
    d?.quote?.price != null && d.quote.prevClose != null && d.quote.prevClose !== 0
      ? ((d.quote.price - d.quote.prevClose) / d.quote.prevClose) * 100
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!d ? (
          <p className="text-[13px] text-slate">loading…</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-ink">
                  {d.name}
                </h2>
                <p className="text-[12.5px] text-slate">
                  {d.symbol} · {d.exchange} · {d.currency} · vs {d.benchmarkSymbol}
                  {!d.isActive && " · delisted"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-slate hover:text-ink"
              >
                ×
              </button>
            </div>

            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {money(d.quote?.price, d.currency)}
              </span>
              {change != null && (
                <span className={`text-[15px] font-medium tabular-nums ${dirText(change)}`}>
                  {change >= 0 ? "▲" : "▼"} {pct(change)}
                </span>
              )}
              <StalenessPill quote={d.quote} />
            </div>

            {d.quote?.circuitState && d.quote.circuitState !== "none" && (
              <p className="mt-1 text-[12px] text-amber">
                {d.quote.circuitState} circuit — no two-way market; the volume
                signal is suppressed.
              </p>
            )}
            {d.quote?.isDisputed && d.quote.disputeNote && (
              <p className="mt-1 text-[12px] text-amber">{d.quote.disputeNote}</p>
            )}

            {d.chart.length > 1 && (
              <div className="mt-4">
                <AbsenceChart closes={d.chart} watermarkDate={d.watchlist.lastSeenAt?.slice(0, 10) ?? null} width={460} height={90} />
                <p className="mt-1 text-[10.5px] text-slate">
                  {d.chart.length} sessions
                  {d.watchlist.lastSeenAt && " · shaded since you last checked"}
                </p>
              </div>
            )}

            {d.stats && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
                <Stat label="beta vs benchmark" value={d.stats.beta60?.toFixed(2)} />
                <Stat
                  label="daily volatility"
                  value={d.stats.sigma60 != null ? `${(d.stats.sigma60 * 100).toFixed(1)}%` : null}
                />
                <Stat label="sessions of data" value={d.stats.sessionsAvailable?.toString()} />
              </div>
            )}

            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-ink">
                Recent detector events
              </p>
              {d.events.length === 0 ? (
                <p className="text-[12.5px] text-slate">
                  Nothing flagged in the recent window.
                </p>
              ) : (
                <ul className="divide-y divide-ink/10 rounded-sm border border-ink/10">
                  {d.events.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                      <div className="min-w-0">
                        <span className="text-slate">{e.sessionDate}</span>{" "}
                        <span className="text-ink">
                          {describeSignal(e.detector, e.z, e.payload)}
                        </span>
                      </div>
                      <span className="shrink-0 tabular-nums text-slate">
                        {signed(e.z, 1)}σ
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {d.watchlist.onWatchlist && d.watchlist.thesis && (
              <p className="mt-3 border-l-2 border-ink/10 pl-3 text-[13px] italic text-ink/80">
                &ldquo;{d.watchlist.thesis}&rdquo;
              </p>
            )}

            <div className="mt-5 flex items-center gap-4 border-t border-ink/10 pt-4 text-[13px]">
              <button
                type="button"
                onClick={toggleWatch}
                disabled={busy}
                className={
                  d.watchlist.onWatchlist
                    ? "text-slate hover:text-amber disabled:opacity-40"
                    : "rounded-sm bg-signal px-3 py-1.5 font-medium text-paper hover:opacity-90 disabled:opacity-50"
                }
              >
                {busy
                  ? "…"
                  : d.watchlist.onWatchlist
                    ? "remove from watchlist"
                    : "+ add to watchlist"}
              </button>
              {d.watchlist.onWatchlist && d.watchlist.positionSize != null && (
                <span className="text-[12px] text-slate">
                  position: {d.watchlist.positionSize.toLocaleString()}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-sm bg-ink/[0.03] px-2 py-1.5">
      <p className="text-[10.5px] uppercase tracking-wide text-slate">{label}</p>
      <p className="tabular-nums text-ink">{value ?? "—"}</p>
    </div>
  );
}
