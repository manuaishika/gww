/**
 * Hand-rolled inline SVG, no charting library — a sparkline is a handful of
 * line segments, and this keeps the design language consistent with the rest
 * of the app instead of a default library look (spec §10: no gradients, no
 * generic components). One of the 4 cheap charts from the spec addendum.
 */
export function Sparkline({
  values,
  width = 72,
  height = 24,
  color = "currentColor",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) {
    return <span className="text-[11px] text-slate">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const up = values[values.length - 1] >= values[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={up ? "text-signal" : "text-slate"}
      aria-hidden
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
