import { pct } from "./format";

/**
 * "Decomposition bar" (spec addendum) — the total move split into market and
 * company portions, as a picture. This is the thesis (spec §4.2) rendered,
 * not just stated: two bars on a shared scale, centred at zero, market in
 * slate, company in signal blue — direction is position, not colour.
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
      <Bar label="market" value={marketPct} width={widthPct(marketPct)} tone="bg-slate/50" />
      <Bar label="company" value={companyPct} width={widthPct(companyPct)} tone="bg-signal" />
    </div>
  );
}

function Bar({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: number;
  width: string;
  tone: string;
}) {
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-slate">{label}</span>
      <div className="relative h-2.5 flex-1">
        <div className="absolute left-1/2 top-0 h-full w-px bg-ink/15" />
        <div
          className={`absolute top-0 h-full rounded-sm ${tone}`}
          style={
            positive
              ? { left: "50%", width }
              : { right: "50%", width }
          }
        />
      </div>
      <span className="w-12 shrink-0 text-right tabular-nums text-ink">{pct(value)}</span>
    </div>
  );
}
