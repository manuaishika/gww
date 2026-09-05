// Client-side mirrors of the API JSON shapes (spec §5, §6, §7). Kept separate
// from the server types so nothing server-only leaks into the client bundle.

export type Quote = {
  price: string | null;
  prevClose: string | null;
  source: string | null;
  exchangeTs: string | null;
  fetchedAt: string | null;
  circuitState: string | null;
  isDisputed: boolean | null;
};

export type WatchlistItem = {
  symbol: string;
  name: string;
  sector: string | null;
  isActive: boolean;
  thesis: string | null;
  addedAt: string;
  mutedUntil: string | null;
  lastSeenAt: string | null;
  positionSize: string | null;
  exchange: string;
  currency: string;
  benchmarkSymbol: string;
  sparkline: number[] | null;
  quote: Quote | null;
};

export type EventSignals = {
  returnZ: number | null;
  returnPct: number | null;
  idioZ: number | null;
  totalPct: number | null;
  marketPct: number | null;
  companyPct: number | null;
  beta60: number | null;
  volumeZ: number | null;
  timesMedian: number | null;
  structural: string[];
  horizonSessions: number;
  baselineDate: string;
  newsCount: number | null;
  isSilence: boolean;
};

export type Decomposition = {
  sessions: number;
  totalPct: number;
  marketPct: number;
  companyPct: number;
};

export type SectorCluster = { sector: string; symbols: string[] };

export type SymbolChart = {
  closes: { date: string; close: number }[];
  zHistory: { date: string; z: number }[];
  watermarkDate: string | null;
};

export type DigestEvent = {
  id: string;
  symbol: string;
  name: string;
  detector: "return_z" | "idio_z" | "volume_z" | "structural" | "news_density" | "silence";
  sessionDate: string;
  z: number;
  score: number;
  payload: EventSignals;
  thesis: string | null;
  sinceLastSeen: Decomposition | null;
  sectorCluster: SectorCluster | null;
  currency: string;
  positionSize: number | null;
  positionBonus: number;
  chart: SymbolChart | null;
};

export type DigestWindow = "checked" | 1 | 7 | 30;

export type Digest = {
  accountCode: string;
  window: DigestWindow;
  windowLabel: string;
  awayDays: number | null;
  awaySessions: number | null;
  lastCheckedAt: string | null;
  watching: number;
  headlines: DigestEvent[];
  lookback: DigestEvent[];
  quieter: { count: number; symbols: { symbol: string; count: number }[] };
  emptyReason: "no_watchlist" | "all_quiet" | "not_watching_yet" | null;
};

export type DataHealth = {
  sources: { primary: string; secondary: string | null };
  totalQuotes: number;
  lastFetchedAt: string | null;
  disputes: { symbol: string; name: string; note: string | null }[];
  circuitLocked: { symbol: string; name: string; state: string }[];
};

export type TrendingItem = {
  symbol: string;
  name: string;
  currency: string;
  sector: string | null;
  detector: "return_z" | "idio_z" | "volume_z" | "structural" | "news_density" | "silence";
  sessionDate: string;
  z: number;
  score: number;
  payload: EventSignals;
};

export type SymbolResult = {
  symbol: string;
  name: string;
  sector: string | null;
  isActive: boolean;
};

export type UniverseSymbol = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  onWatchlist: boolean;
};

export type SectorGroup = { sector: string; symbols: UniverseSymbol[] };

export type SymbolDetail = {
  symbol: string;
  name: string;
  sector: string | null;
  exchange: string;
  currency: string;
  benchmarkSymbol: string;
  isActive: boolean;
  quote: {
    price: number | null;
    prevClose: number | null;
    source: string | null;
    exchangeTs: string | null;
    fetchedAt: string | null;
    circuitState: string | null;
    isDisputed: boolean | null;
    disputeNote: string | null;
  } | null;
  stats: {
    sigma60: number | null;
    beta60: number | null;
    residSigma60: number | null;
    high252: number | null;
    low252: number | null;
    sessionsAvailable: number | null;
  } | null;
  events: {
    id: string;
    detector: DigestEvent["detector"];
    sessionDate: string;
    z: number;
    score: number;
    payload: EventSignals;
  }[];
  chart: { date: string; close: number }[];
  watchlist: {
    onWatchlist: boolean;
    thesis: string | null;
    positionSize: number | null;
    lastSeenAt: string | null;
  };
};
