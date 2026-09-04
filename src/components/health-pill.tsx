"use client";

import { useEffect, useState } from "react";

type Health =
  | { state: "loading" }
  | { state: "ok"; symbols: number }
  | { state: "down"; detail: string };

export function HealthPill() {
  const [health, setHealth] = useState<Health>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok) setHealth({ state: "ok", symbols: d.symbols });
        else setHealth({ state: "down", detail: d.detail ?? "unreachable" });
      })
      .catch((e) => {
        if (!cancelled) setHealth({ state: "down", detail: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dot =
    health.state === "ok"
      ? "bg-signal"
      : health.state === "down"
        ? "bg-amber"
        : "bg-slate/40";

  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-slate">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {health.state === "loading" && "checking database…"}
      {health.state === "ok" &&
        `database connected — ${health.symbols} symbols seeded`}
      {health.state === "down" &&
        "no database configured — run npm run setup"}
    </span>
  );
}
