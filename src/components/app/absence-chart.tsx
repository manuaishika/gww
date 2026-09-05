/**
 * "Absence chart" (spec addendum) — the last ~60 sessions' price, with the
 * window since you last checked shaded. You see the gap you missed, not just
 * a number describing it. Hand-rolled SVG — see sparkline.tsx for why.
 */
export function AbsenceChart({
  closes,
  watermarkDate,
  width = 280,
  height = 72,
}: {
  closes: { date: string; close: number }[];
  watermarkDate: string | null;
  width?: number;
  height?: number;
}) {
  if (closes.length < 2) return null;

  const values = closes.map((c) => c.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;
  const n = closes.length;

  const x = (i: number) => (i / (n - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

  const points = closes.map((c, i) => `${x(i).toFixed(1)},${y(c.close).toFixed(1)}`);

  const shadeStartIdx = watermarkDate
    ? closes.findIndex((c) => c.date >= watermarkDate)
    : -1;
  const shadeX = shadeStartIdx >= 0 ? x(shadeStartIdx) : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      role="img"
      aria-label="Price over the last 60 sessions, with the period since you last checked shaded"
    >
      {shadeX != null && (
        <rect
          x={shadeX}
          y={0}
          width={width - shadeX}
          height={height}
          className="fill-signal/10"
        />
      )}
      <polyline
        points={points.join(" ")}
        fill="none"
        className="stroke-ink/70"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {shadeX != null && (
        <line
          x1={shadeX}
          x2={shadeX}
          y1={0}
          y2={height}
          className="stroke-signal/50"
          strokeWidth={1}
          strokeDasharray="2,2"
        />
      )}
    </svg>
  );
}
