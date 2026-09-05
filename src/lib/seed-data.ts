/**
 * The universe. ~30 NSE symbols across sectors + the index.
 * Bars for these are backfilled and committed in Phase 1 (spec §12).
 * NSE tickers here carry no suffix; the `.NS` suffix is added only in the
 * yahoo-finance2 ingest path.
 */
export type SeedSymbol = {
  symbol: string;
  name: string;
  sector: string;
  listedOn: string; // ISO date
  isActive?: boolean; // default true; false = delisted/renamed (spec §9)
  note?: string;
  // Multi-market: default to NSE/INR/IST/NIFTY when omitted.
  exchange?: string;
  currency?: string;
  timezone?: string;
  benchmarkSymbol?: string;
};

export const NIFTY_SYMBOL = "NIFTY50";
export const SPX_SYMBOL = "SPX500";

export const SEED_SYMBOLS: SeedSymbol[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy", listedOn: "1995-11-29" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT", listedOn: "2004-08-25" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Financials", listedOn: "1995-11-08" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Financials", listedOn: "1997-09-17" },
  { symbol: "INFY", name: "Infosys", sector: "IT", listedOn: "1993-06-14" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Financials", listedOn: "1995-03-01" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", listedOn: "2002-02-18" },
  { symbol: "ITC", name: "ITC", sector: "FMCG", listedOn: "1995-08-23" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Industrials", listedOn: "1995-06-01" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Financials", listedOn: "1995-12-20" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG", listedOn: "1995-07-01" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Financials", listedOn: "1998-11-16" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "Financials", listedOn: "1994-03-21" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Consumer Discretionary", listedOn: "1995-04-13" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", sector: "Auto", listedOn: "2003-07-09" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma", listedOn: "1994-02-08" },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer Discretionary", listedOn: "1995-12-21" },
  { symbol: "NTPC", name: "NTPC", sector: "Power", listedOn: "2004-11-05" },
  { symbol: "POWERGRID", name: "Power Grid Corporation", sector: "Power", listedOn: "2007-10-05" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Materials", listedOn: "2004-08-24" },
  {
    symbol: "TATAMOTORS",
    name: "Tata Motors (demerged)",
    sector: "Auto",
    listedOn: "1998-07-22",
    isActive: false,
    note: "Demerged into TMPV / TMCV in 2025; the TATAMOTORS line no longer trades. Kept as a live example of the delisted/renamed edge case (spec §9) — it stays in a watchlist, renders dimmed, and fires no detectors.",
  },
  { symbol: "M&M", name: "Mahindra & Mahindra", sector: "Auto", listedOn: "1995-07-03" },
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Materials", listedOn: "1995-11-22" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT", listedOn: "1995-11-08" },
  { symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG", listedOn: "2010-01-04" },
  { symbol: "ADANIENT", name: "Adani Enterprises", sector: "Conglomerate", listedOn: "1994-11-24" },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Materials", listedOn: "2005-04-25" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Energy", listedOn: "2010-11-04" },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT", listedOn: "2000-01-06" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", sector: "Pharma", listedOn: "1995-11-08" },
  { symbol: "EICHERMOT", name: "Eicher Motors", sector: "Auto", listedOn: "1995-07-03" },

  // --- Multi-market proof (spec addendum) ---------------------------------
  // Currency, exchange, timezone and benchmark are per-symbol columns, not
  // global constants. These regress against SPX500, not NIFTY — a real
  // second market, not a hypothetical one. No currency conversion, anywhere:
  // z-scores are unitless, so an AAPL move and a RELIANCE move compare on
  // materiality without ever touching an FX rate.
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    sector: "IT",
    listedOn: "1980-12-12",
    exchange: "NASDAQ",
    currency: "USD",
    timezone: "America/New_York",
    benchmarkSymbol: SPX_SYMBOL,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    sector: "IT",
    listedOn: "1986-03-13",
    exchange: "NASDAQ",
    currency: "USD",
    timezone: "America/New_York",
    benchmarkSymbol: SPX_SYMBOL,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    sector: "IT",
    listedOn: "2004-08-19",
    exchange: "NASDAQ",
    currency: "USD",
    timezone: "America/New_York",
    benchmarkSymbol: SPX_SYMBOL,
  },
];
