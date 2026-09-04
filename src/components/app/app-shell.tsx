"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api-client";
import { AccountBar } from "./account-bar";
import { AddSymbol } from "./add-symbol";
import { DigestView } from "./digest-view";
import { Hero } from "./hero";
import { WatchlistTable } from "./watchlist-table";
import type { Digest, WatchlistItem } from "./types";

type View = "digest" | "table";

export function AppShell() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [view, setView] = useState<View>("digest");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
