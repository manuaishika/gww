"use client";

import { useEffect, useState } from "react";

type Health =
  | { state: "loading" }
  | {
      state: "ok";
      symbols: number;
      bars: number;
      events: number;
      lastSession: string | null;
    }
  | { state: "down"; detail: string };

export function HealthPill() {
  const [health, setHealth] = useState<Health>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.ok)
          setHealth({
            state: "ok",
            symbols: d.symbols,
            bars: d.bars,
            events: d.events ?? 0,
            lastSession: d.lastSession,
          });
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
        (health.bars > 0
          ? `${health.symbols} symbols · ${health.bars.toLocaleString("en-IN")} bars · ${health.events.toLocaleString("en-IN")} events · through ${health.lastSession}`
          : `database connected — ${health.symbols} symbols, no bars (run npm run seed)`)}
      {health.state === "down" && "no database configured — run npm run setup"}
    </span>
  );
}
