"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api-client";
import { AccountBar } from "./account-bar";
import { AddSymbol } from "./add-symbol";
import { DataHealthPanel } from "./data-health-panel";
import { DigestView } from "./digest-view";
import { DiscoverView } from "./discover-view";
import { Hero } from "./hero";
import { SymbolDetailProvider } from "./symbol-detail";
import { TrendingPreview } from "./trending-preview";
import { WatchlistTable } from "./watchlist-table";
import type { Digest, DigestWindow, WatchlistItem } from "./types";

type View = "digest" | "table" | "discover";

const DEMO_CODE = "GRW-24X";

export function AppShell() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [view, setView] = useState<View>("digest");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [digestWindow, setDigestWindow] = useState<DigestWindow>("checked");
  const windowRef = useRef(digestWindow);
  windowRef.current = digestWindow;
  const didInit = useRef(false);

  const load = useCallback(async () => {
    try {
      const [d, w] = await Promise.all([
        api.digest(windowRef.current),
        api.watchlist(),
      ]);
      setDigest(d);
      setItems(w.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load");
    }
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // ?sync=<code> — from a QR scanned on another device (see AccountBar).
    const params = new URLSearchParams(window.location.search);
    const syncCode = params.get("sync");
    if (syncCode) {
      window.history.replaceState({}, "", window.location.pathname);
      api.adopt(syncCode).then(() => load()).catch(() => load());
      return;
    }
    load();
  }, [load]);

  useEffect(() => {
    if (didInit.current) load();
  }, [digestWindow, load]);

  async function dismiss(eventId: string) {
    setBusyKey(eventId);
    try {
      await api.markSeen({ eventIds: [eventId] });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function markAllRead() {
    setBusyKey("__all__");
    try {
      await api.markSeen({ all: true });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(symbol: string) {
    setBusyKey(symbol);
    try {
      await api.remove(symbol);
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function saveThesis(symbol: string, thesis: string) {
    await api.updateThesis(symbol, thesis || null);
    await load();
  }

  async function savePosition(symbol: string, size: number | null) {
    await api.updatePositionSize(symbol, size);
    await load();
  }

  async function loadDemo() {
    setLoadingDemo(true);
    try {
      await api.adopt(DEMO_CODE);
      await load();
    } finally {
      setLoadingDemo(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-[15px] text-ink">Couldn&rsquo;t reach the API.</p>
        <p className="mt-1 text-[13px] text-slate">{error}</p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-4 text-[13px] text-signal hover:underline"
        >
          try again
        </button>
      </div>
    );
  }

  if (!digest || !items) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-[13px] text-slate">loading…</p>
      </div>
    );
  }

  return (
    <SymbolDetailProvider onChanged={load}>
    <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold tracking-tight text-ink">
            Smart Market Watchlist
          </p>
          <p className="text-[12px] text-slate">
            what moved that matters, since you last looked
          </p>
        </div>
        <AccountBar accountCode={digest.accountCode} onSynced={load} />
      </div>

      <Hero digest={digest} />

      {digest.watching === 0 ? (
        <FirstRun loadingDemo={loadingDemo} onLoadDemo={loadDemo} onAdded={load} />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex gap-1 text-[13px]">
              <TabButton active={view === "digest"} onClick={() => setView("digest")}>
                Digest
              </TabButton>
              <TabButton active={view === "table"} onClick={() => setView("table")}>
                Table ({items.length})
              </TabButton>
              <TabButton active={view === "discover"} onClick={() => setView("discover")}>
                Discover
              </TabButton>
            </div>
            {view === "digest" && digestWindow === "checked" && digest.headlines.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={busyKey === "__all__"}
                className="text-[12.5px] text-slate hover:text-ink disabled:opacity-40"
              >
                mark all read
              </button>
            )}
          </div>

          {view === "digest" && (
            <>
              <WindowToggle value={digestWindow} onChange={setDigestWindow} />
              <DigestView digest={digest} onDismiss={dismiss} busyId={busyKey} />
            </>
          )}
          {view === "table" && (
            <WatchlistTable
              items={items}
              onRemove={remove}
              onSaveThesis={saveThesis}
              onSavePosition={savePosition}
              busySymbol={busyKey}
            />
          )}
          {view === "discover" && <DiscoverView onChanged={load} />}

          {view !== "discover" && (
            <div className="mt-10 border-t border-ink/10 pt-6">
              <p className="mb-2 text-[13px] font-medium text-ink">Add to your watchlist</p>
              <AddSymbol onAdded={load} />
            </div>
          )}

          <DataHealthPanel />
        </>
      )}
    </div>
    </SymbolDetailProvider>
  );
}

/** The first screen for a visitor with no watchlist yet. */
function FirstRun({
  loadingDemo,
  onLoadDemo,
  onAdded,
}: {
  loadingDemo: boolean;
  onLoadDemo: () => void;
  onAdded: () => void;
}) {
  return (
    <div>
      <TrendingPreview onAdded={onAdded} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-ink/10 bg-ink/[0.02] p-5">
          <p className="text-[14px] font-medium text-ink">Example watchlist</p>
          <p className="mt-1 text-[13px] text-slate">
            12 stocks, NSE and US, with detector events, charts and theses.
            Account code <code className="rounded-sm bg-ink/5 px-1 py-0.5">{DEMO_CODE}</code>.
          </p>
          <button
            type="button"
            onClick={onLoadDemo}
            disabled={loadingDemo}
            className="mt-3 rounded-sm bg-signal px-4 py-2 text-[13px] font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {loadingDemo ? "Loading…" : "Load it"}
          </button>
        </div>

        <div className="rounded-md border border-dashed border-ink/15 p-5">
          <p className="text-[14px] font-medium text-ink">Start your own</p>
          <p className="mt-1 text-[13px] text-slate">
            Search NSE or US. A just-added symbol has no baseline — the digest
            fills in from the next session.
          </p>
          <div className="mt-3">
            <AddSymbol onAdded={onAdded} />
          </div>
        </div>
      </div>
    </div>
  );
}

const WINDOWS: { v: DigestWindow; label: string }[] = [
  { v: "checked", label: "Since you checked" },
  { v: 1, label: "Today" },
  { v: 7, label: "7 days" },
  { v: 30, label: "30 days" },
];

function WindowToggle({
  value,
  onChange,
}: {
  value: DigestWindow;
  onChange: (w: DigestWindow) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 text-[12px]">
      {WINDOWS.map(({ v, label }) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={
            "rounded-full px-2.5 py-1 transition " +
            (value === v
              ? "bg-ink text-paper"
              : "border border-ink/15 text-slate hover:text-ink")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-sm px-2.5 py-1 transition " +
        (active ? "bg-ink text-paper" : "text-slate hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
