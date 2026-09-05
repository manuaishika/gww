/**
 * "Z-context strip" (spec addendum) — this move plotted against the stock's
 * last 60 daily moves, so the outlier is visible, not asserted. Every past
 * day is a small dot on a shared z-scale; today is the larger, signal-coloured
 * one. If it's not clearly out at the tail, the "notable" label wasn't lying.
 */
export function ZContextStrip({
  zHistory,
  currentZ,
  width = 280,
  height = 28,
}: {
  zHistory: { date: string; z: number }[];
  currentZ: number;
  width?: number;
  height?: number;
}) {
  if (zHistory.length === 0) return null;

  const CLAMP = 4; // beyond ±4σ, pin to the edge rather than compress the rest
  const scale = (z: number) => {
    const c = Math.max(-CLAMP, Math.min(CLAMP, z));
    return ((c + CLAMP) / (2 * CLAMP)) * width;
  };
  const midY = height / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      role="img"
      aria-label={`This move (${currentZ.toFixed(1)}σ) against the last ${zHistory.length} daily moves`}
    >
      <line x1={scale(0)} x2={scale(0)} y1={0} y2={height} className="stroke-ink/10" strokeWidth={1} />
      {zHistory.map((h, i) => (
        <circle key={i} cx={scale(h.z)} cy={midY} r={1.6} className="fill-slate/40" />
      ))}
      <circle
        cx={scale(currentZ)}
        cy={midY}
        r={3.2}
        className="fill-signal"
        stroke="var(--paper)"
        strokeWidth={1}
      />
    </svg>
  );
}
