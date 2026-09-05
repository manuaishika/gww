// Small formatting helpers shared by the digest cards and the table. Every
// figure gets `tabular-nums` in CSS (globals.css), not here.

export const signed = (n: number | null | undefined, dp = 1): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const s = n.toFixed(dp);
  return n > 0 ? `+${s}` : s;
};

export const pct = (n: number | null | undefined, dp = 1): string =>
  n == null || Number.isNaN(n) ? "—" : `${signed(n, dp)}%`;

// Multi-market (spec addendum): currency is per-symbol, never converted.
// A symbol in USD shows $; INR shows ₹. Materiality (z-scores, %) is
// currency-free and compares across markets without any of this.
const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const CURRENCY_LOCALE: Record<string, string> = { INR: "en-IN", USD: "en-US" };

export const money = (
  v: string | number | null | undefined,
  currency: string = "INR",
): string => {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const locale = CURRENCY_LOCALE[currency] ?? "en-US";
  return `${symbol}${n.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
};

/** @deprecated use `money(v, currency)` — kept only while callers migrate. */
export const rupees = (v: string | number | null | undefined): string => money(v, "INR");

const FLAG_LABEL: Record<string, string> = {
  new_252d_high: "new 252-session high",
  new_252d_low: "new 252-session low",
  overnight_gap: "overnight gap",
  ma50_cross_up: "crossed above its 50-day average",
  ma50_cross_down: "crossed below its 50-day average",
};

export const flagLabel = (flag: string): string => FLAG_LABEL[flag] ?? flag;

export const awayText = (
  awayDays: number | null,
  watching: number,
): string => {
  if (watching === 0) return "Nothing on your watchlist yet.";
  if (awayDays == null) return "Watching from today.";
  if (awayDays === 0) return "You checked today.";
  if (awayDays === 1) return "You were away 1 day.";
  return `You were away ${awayDays} days.`;
};
