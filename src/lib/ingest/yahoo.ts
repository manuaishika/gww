/**
 * Primary market-data source (spec §2). yahoo-finance2 needs no API key.
 * NSE symbols take a `.NS` suffix; US symbols are bare; the two index
 * benchmarks map to `^NSEI` / `^GSPC`.
 *
 * Every function here catches its own errors and returns null / [] — a failed
 * fetch for one symbol must never take down a whole ingest run (spec's
 * "unreliable dependencies").
 */
import YahooFinance from "yahoo-finance2";
import { NIFTY_SYMBOL, SPX_SYMBOL } from "../seed-data";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const US_SYMBOLS = new Set(["AAPL", "MSFT", "GOOGL"]);

export function yahooTicker(symbol: string): string {
  if (symbol === NIFTY_SYMBOL) return "^NSEI";
  if (symbol === SPX_SYMBOL) return "^GSPC";
  if (US_SYMBOLS.has(symbol)) return symbol;
  return `${symbol}.NS`;
}

export type FetchedBar = {
  sessionDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
};

export type FetchedQuote = {
  price: number;
  prevClose: number | null;
  exchangeTs: Date;
};

const istOrLocalDate = (d: Date): string =>
  new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/** Recent daily bars — `lookbackDays` calendar days back. Returns [] on failure. */
export async function fetchRecentBars(
  symbol: string,
  lookbackDays = 8,
): Promise<FetchedBar[]> {
  try {
    const res = await yf.chart(yahooTicker(symbol), {
      period1: new Date(Date.now() - lookbackDays * 86_400_000),
      interval: "1d",
    });
    const todayIso = new Date().toISOString().slice(0, 10);
    return res.quotes
      .filter((q) => q.close != null && q.date != null)
      .map((q) => ({
        sessionDate: istOrLocalDate(new Date(q.date)),
        open: Number(q.open),
        high: Number(q.high),
        low: Number(q.low),
        close: Number(q.close),
        adjClose: Number(q.adjclose ?? q.close),
        volume: q.volume == null ? 0 : Math.round(q.volume),
      }))
      .filter((b) => b.sessionDate < todayIso); // drop the live partial session
  } catch {
    return [];
  }
}

/** Latest quote. Returns null on failure. */
export async function fetchQuote(symbol: string): Promise<FetchedQuote | null> {
  try {
    const q = await yf.quote(yahooTicker(symbol));
    if (q?.regularMarketPrice == null) return null;
    return {
      price: q.regularMarketPrice,
      prevClose: q.regularMarketPreviousClose ?? null,
      exchangeTs: q.regularMarketTime ? new Date(q.regularMarketTime) : new Date(),
    };
  } catch {
    return null;
  }
}
