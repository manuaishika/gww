"use client";

import { useState } from "react";
import { api } from "./api-client";

/** Cross-device sync is one text field (spec §6) — no OAuth. */
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

  return (
    <div className="flex flex-col items-end gap-1.5 text-[12.5px]">
      <div className="flex items-center gap-2 text-slate">
        <span>account</span>
        <code className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-medium text-ink">
          {accountCode}
        </code>
        <button type="button" className="text-signal hover:underline" onClick={() => setOpen((v) => !v)}>
          sync device
        </button>
      </div>
      {open && (
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="K7M-2QX"
            className="w-28 rounded-sm border border-ink/15 bg-paper px-2 py-1 text-[12.5px] uppercase text-ink outline-none focus:border-signal"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || code.trim().length < 6}
            className="text-signal hover:underline disabled:opacity-40"
          >
            {busy ? "…" : "adopt"}
          </button>
          {error && <span className="text-amber">{error}</span>}
        </div>
      )}
    </div>
  );
}
