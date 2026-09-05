import { awayText } from "./format";
import type { Digest } from "./types";

/**
 * The hero is the time gap (spec §10). First thing on screen is not a logo or
 * a ticker grid — it's "You were away 3 days", then the cards. The away
 * number gets real visual weight; everything else defers to it.
 */
export function Hero({ digest }: { digest: Digest }) {
  const headlineN = digest.headlines.length;
  const sub =
    digest.watching === 0
      ? "Add a symbol to start a digest."
      : headlineN > 0
        ? `${headlineN} of ${digest.watching} moved enough to surface. The rest stayed inside their normal range.`
        : digest.emptyReason === "not_watching_yet"
          ? `Watching ${digest.watching}. Recent history below.`
          : digest.emptyReason === "all_quiet"
            ? `Watching ${digest.watching}. Nothing crossed the bar.`
            : `Watching ${digest.watching}.`;

  const days = digest.awayDays;
  const showBigNumber = digest.watching > 0 && days != null && days >= 1;

  return (
    <header className="mb-9">
      {showBigNumber ? (
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-semibold leading-none tracking-tight text-ink tabular-nums sm:text-6xl">
            {days}
          </span>
          <span className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            {days === 1 ? "day" : "days"} away
          </span>
        </div>
      ) : (
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {awayText(days, digest.watching)}
        </h1>
      )}
      <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-slate">{sub}</p>
    </header>
  );
}
