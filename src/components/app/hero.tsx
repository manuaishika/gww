import { awayText } from "./format";
import type { Digest } from "./types";

/**
 * The hero is the time gap (spec §10). First thing on screen is not a logo or
 * a ticker grid — it's "You were away 3 days", then the cards.
 */
export function Hero({ digest }: { digest: Digest }) {
  const sub =
    digest.watching === 0
      ? "Add a symbol below — the digest is empty until you're watching something."
      : digest.headlines.length > 0
        ? `Watching ${digest.watching}. Here's what actually moved.`
        : digest.emptyReason === "all_quiet"
          ? `Watching ${digest.watching}. Nothing crossed the bar.`
          : `Watching ${digest.watching}.`;

  return (
    <header className="mb-10">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {awayText(digest.awayDays, digest.watching)}
      </h1>
      <p className="mt-2 text-[15px] text-slate">{sub}</p>
    </header>
  );
}
