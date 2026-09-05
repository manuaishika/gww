"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api-client";
import { AccountBar } from "./account-bar";
import { AddSymbol } from "./add-symbol";
import { DataHealthPanel } from "./data-health-panel";
import { DigestView } from "./digest-view";
import { Hero } from "./hero";
import { WatchlistTable } from "./watchlist-table";
import type { Digest, WatchlistItem } from "./types";

type View = "digest" | "table";

const DEMO_CODE = "GRW-24X";

export function AppShell() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [view, setView] = useState<View>("digest");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, w] = await Promise.all([api.digest(), api.watchlist()]);
      setDigest(d);
      setItems(w.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="text-[13px] font-medium uppercase tracking-wide text-slate">
          Smart Market Watchlist
        </p>
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
            </div>
            {view === "digest" && digest.headlines.length > 0 && (
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

          {view === "digest" ? (
            <DigestView digest={digest} onDismiss={dismiss} busyId={busyKey} />
          ) : (
            <WatchlistTable
              items={items}
              onRemove={remove}
              onSaveThesis={saveThesis}
              busySymbol={busyKey}
            />
          )}

          <div className="mt-10 border-t border-ink/10 pt-6">
            <p className="mb-2 text-[13px] font-medium text-ink">Add to your watchlist</p>
            <AddSymbol onAdded={load} />
          </div>

          <DataHealthPanel />
        </>
      )}
    </div>
  );
}

/**
 * A brand-new visitor has zero watchlist by design (spec §10's empty state
 * says what to do next) — but "what to do next" needs to be one obvious
 * action, not a hunt for the sync-device link. Two real options, not a blank
 * page: load the worked example, or add your own first symbol right here.
 */
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
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-md border border-ink/10 bg-ink/[0.02] p-5">
        <p className="text-[14px] font-medium text-ink">See it working first</p>
        <p className="mt-1 text-[13px] text-slate">
          Loads a populated example — 10 NSE stocks, real detector events, theses
          attached. Account code <code className="rounded-sm bg-ink/5 px-1 py-0.5">{DEMO_CODE}</code>.
        </p>
        <button
          type="button"
          onClick={onLoadDemo}
          disabled={loadingDemo}
          className="mt-3 rounded-sm bg-signal px-4 py-2 text-[13px] font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {loadingDemo ? "Loading…" : "Load the example"}
        </button>
      </div>

      <div className="rounded-md border border-dashed border-ink/15 p-5">
        <p className="text-[14px] font-medium text-ink">Or start your own</p>
        <p className="mt-1 text-[13px] text-slate">
          Search an NSE symbol and add it. The digest fills in from the next
          session onward — a just-added symbol has no baseline yet.
        </p>
        <div className="mt-3">
          <AddSymbol onAdded={onAdded} />
        </div>
      </div>
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
