/**
 * Optional second market-data source. Exists only to produce
 * disagreements to reconcile against — the app must work, and does, without
 * it. If `FINNHUB_API_KEY` is unset this degrades to "unconfigured", silently,
 * everywhere it's called. Never throws.
 */

export type FinnhubQuote = { price: number; timestamp: Date };

export function isFinnhubConfigured(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}

/**
 * NSE isn't on Finnhub's free tier for most symbols — this is written to the
 * real API shape so it's a real integration, not a stub, but it's expected to
 * return null for most NSE tickers without a paid plan. That's fine: a null
 * second source is exactly the "app works with one source" path.
 */
export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}.NS&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = (await res.json()) as { c?: number; t?: number };
    if (!data.c || !data.t) return null; // Finnhub returns c:0 for an unknown symbol

    return { price: data.c, timestamp: new Date(data.t * 1000) };
  } catch {
    // network error, timeout, bad JSON — a second source going away is not a
    // failure of the app; it just means one source for this tick.
    return null;
  }
}
