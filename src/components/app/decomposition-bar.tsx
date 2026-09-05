import { dirText, pct } from "./format";

/**
 * "Decomposition bar" (spec addendum) — the total move split into market and
 * company portions, as a picture. Two bars on a shared scale, centred at
 * zero. Colour is direction only (gain / loss), length is the magnitude —
 * length carries "how much", not colour.
 */
export function DecompositionBar({
  marketPct,
  companyPct,
}: {
  marketPct: number;
  companyPct: number;
}) {
  const maxAbs = Math.max(Math.abs(marketPct), Math.abs(companyPct), 0.5);
  const widthPct = (v: number) => `${(Math.abs(v) / maxAbs) * 50}%`;

  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <Bar label="market" value={marketPct} width={widthPct(marketPct)} />
      <Bar label="company" value={companyPct} width={widthPct(companyPct)} />
    </div>
  );
}

function Bar({
  label,
  value,
  width,
}: {
  label: string;
  value: number;
  width: string;
}) {
  const positive = value >= 0;
  const tone = positive ? "bg-gain" : "bg-loss";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-slate">{label}</span>
      <div className="relative h-2.5 flex-1">
        <div className="absolute left-1/2 top-0 h-full w-px bg-ink/15" />
        <div
          className={`absolute top-0 h-full rounded-sm ${tone}`}
          style={positive ? { left: "50%", width } : { right: "50%", width }}
        />
      </div>
      <span className={`w-12 shrink-0 text-right tabular-nums ${dirText(value)}`}>
        {pct(value)}
      </span>
    </div>
  );
}
