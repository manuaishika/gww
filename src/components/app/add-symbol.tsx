"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api-client";
import type { SymbolResult } from "./types";

export function AddSymbol({ onAdded }: { onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SymbolResult | null>(null);
  const [thesis, setThesis] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (picked) return;
    const t = setTimeout(() => {
      api
        .search(q)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q, picked]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api.add(picked.symbol, thesis.trim() || undefined);
      setQ("");
      setPicked(null);
      setThesis("");
      setResults([]);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <input
          value={picked ? `${picked.symbol} — ${picked.name}` : q}
          onChange={(e) => {
            setPicked(null);
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search an NSE symbol — e.g. RELIANCE, Titan, HDFC Bank"
          className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-signal"
        />
        {picked && (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="shrink-0 rounded-sm bg-signal px-4 py-2 text-[13px] font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        )}
      </div>

      {picked && (
        <input
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Optional — why are you watching this?"
          className="mt-2 w-full rounded-sm border border-ink/15 bg-paper px-3 py-1.5 text-[13px] text-ink outline-none focus:border-signal"
        />
      )}

      {error && <p className="mt-1 text-[12px] text-amber">{error}</p>}

      {open && !picked && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-sm border border-ink/10 bg-paper shadow-lg">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => {
                  setPicked(r);
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between px-3 py-2 text-left text-[13.5px] hover:bg-ink/[0.03]"
              >
                <span className="font-medium text-ink">{r.symbol}</span>
                <span className="ml-3 truncate text-slate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
