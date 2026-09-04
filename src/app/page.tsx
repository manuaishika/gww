import { HealthPill } from "@/components/health-pill";

// Phase 0 — the shell. The digest surface arrives in Phase 4.
// The hero is the time gap, per spec §10: not a logo, not a ticker grid.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-[13px] font-medium uppercase tracking-wide text-slate">
        Smart Market Watchlist
      </p>

      <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        What changed that actually
        <br />
        matters, and why should you care?
      </h1>

      <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-slate">
        A watchlist&rsquo;s job isn&rsquo;t to show you prices. It&rsquo;s to tell
        you what moved since you last looked &mdash; normalised against each
        stock&rsquo;s own volatility, with the market&rsquo;s move stripped out, so
        a 3% day in a smallcap doesn&rsquo;t read the same as a 3% day in ITC.
      </p>

      <div className="mt-10 border-t border-ink/10 pt-6">
        <p className="text-[13px] text-slate">
          <span className="font-medium text-ink">Phase 3.</span> The detector
          engine and digest API are live &mdash; <code className="rounded bg-ink/5 px-1 py-0.5 text-[12px]">GET /api/digest</code>{" "}
          returns ranked events. The reading surface (spec §5, §10) lands next.
        </p>
        <p className="mt-2 text-[13px] text-slate">
          See a populated example: enter account code{" "}
          <code className="rounded bg-ink/5 px-1 py-0.5 text-[12px]">GRW-24X</code>{" "}
          via <code className="rounded bg-ink/5 px-1 py-0.5 text-[12px]">POST /api/session/adopt</code>.
        </p>
        <div className="mt-3">
          <HealthPill />
        </div>
      </div>
    </main>
  );
}
