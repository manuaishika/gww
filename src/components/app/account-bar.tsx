"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "./api-client";

/**
 * Cross-device sync without an account system (no OAuth). Your code
 * is assigned on first visit and remembers THIS watchlist. To get it onto
 * another device you don't have to type or remember anything — scan the QR
 * with your phone camera and it opens the app already synced (the QR is a URL
 * with `?sync=<code>`, which AppShell adopts on load).
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
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || qr) return;
    const url = `${window.location.origin}/?sync=${encodeURIComponent(accountCode)}`;
    QRCode.toDataURL(url, { margin: 1, width: 132 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open, qr, accountCode]);

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
        <span>account</span>
        <button
          type="button"
          onClick={copyCode}
          title="Copy account code"
          className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-medium text-ink hover:bg-ink/10"
        >
          {copied ? "copied ✓" : accountCode}
        </button>
        <button
          type="button"
          className="text-signal hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          other device
        </button>
      </div>

      {open && (
        <div className="flex w-[220px] flex-col items-end gap-2 rounded-sm border border-ink/10 bg-paper p-3">
          <p className="text-right text-[12px] text-slate">Scan to open this watchlist on your phone.</p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`Sync code ${accountCode}`} width={132} height={132} />
          ) : (
            <div className="h-[132px] w-[132px] animate-pulse rounded-sm bg-ink/5" />
          )}
          <details className="w-full text-[11.5px] text-slate">
            <summary className="cursor-pointer hover:text-ink">enter a code instead</summary>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC-123"
                className="w-24 rounded-sm border border-ink/15 bg-paper px-2 py-1 uppercase text-ink outline-none focus:border-signal"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || code.trim().length < 6}
                className="text-signal hover:underline disabled:opacity-40"
              >
                {busy ? "…" : "go"}
              </button>
            </div>
            {error && <p className="mt-1 text-amber">{error}</p>}
          </details>
        </div>
      )}
    </div>
  );
}
