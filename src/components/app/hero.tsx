import { awayText } from "./format";
import type { Digest } from "./types";

/**
 * The hero is the time gap. Default: "3 days away" as a large
 * numeral. In a fixed-window review (Today / 7d / 30d) it names the window
 * instead — the default is never a fixed window, but the window views are a
 * real workflow and should say what they are.
 */
export function Hero({ digest }: { digest: Digest }) {
  const headlineN = digest.headlines.length;
  const windowed = digest.window !== "checked";

  const sub =
    digest.watching === 0
      ? "Add a symbol to start a digest."
      : headlineN > 0
        ? `${headlineN} of ${digest.watching} moved enough to surface. The rest stayed inside their normal range.`
        : digest.emptyReason === "not_watching_yet"
          ? `Watching ${digest.watching}. Recent history below.`
          : `Watching ${digest.watching}. Nothing crossed the bar ${digest.windowLabel}.`;

  const days = digest.awayDays;
  const showBigNumber = !windowed && digest.watching > 0 && days != null && days >= 1;

  return (
    <header className="mb-9">
      {windowed ? (
        <h1 className="text-3xl font-semibold capitalize tracking-tight text-ink sm:text-4xl">
          {digest.windowLabel}
        </h1>
      ) : showBigNumber ? (
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
