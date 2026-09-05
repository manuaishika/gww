"use client";

import { useState } from "react";
import { api } from "./api-client";

/**
 * Cross-device sync is one text field (spec §6) — no OAuth. `accountCode` is
 * assigned automatically on first visit and remembers THIS watchlist; typing
 * it into another device's sync box loads the same one there.
 */
export function AccountBar({
  accountCode,
  onSynced,
}: {
  accountCode: string;
  onSynced: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.adopt(code);
      setOpen(false);
      setCode("");
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "no account with that code");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(accountCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can be denied — the code is still visible to copy by hand
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 text-[12.5px]">
      <div className="flex items-center gap-2 text-slate">
        <span>your code</span>
        <button
          type="button"
          onClick={copyCode}
          title="Click to copy — this is what remembers your watchlist"
          className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-medium text-ink hover:bg-ink/10"
        >
          {copied ? "copied ✓" : accountCode}
        </button>
        <button
          type="button"
          className="text-signal hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          use on another device
        </button>
      </div>
      {open && (
        <div className="flex max-w-[280px] flex-col items-end gap-1.5">
          <p className="text-right text-slate">
            On your other device, open this app and enter{" "}
            <span className="font-medium text-ink">{accountCode}</span> below
            to see this same watchlist there.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="enter a code"
              className="w-32 rounded-sm border border-ink/15 bg-paper px-2 py-1 text-[12.5px] uppercase text-ink outline-none focus:border-signal"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || code.trim().length < 6}
              className="text-signal hover:underline disabled:opacity-40"
            >
              {busy ? "…" : "switch to it"}
            </button>
          </div>
          {error && <span className="text-amber">{error}</span>}
        </div>
      )}
    </div>
  );
}
