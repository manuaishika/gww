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
};

export type Decomposition = {
  sessions: number;
  totalPct: number;
  marketPct: number;
  companyPct: number;
};

export type DigestEvent = {
  id: string;
  symbol: string;
  name: string;
  detector: "return_z" | "idio_z" | "volume_z" | "structural";
  sessionDate: string;
  z: number;
  score: number;
  payload: EventSignals;
  thesis: string | null;
  sinceLastSeen: Decomposition | null;
};

export type Digest = {
  accountCode: string;
  awayDays: number | null;
  awaySessions: number | null;
  lastCheckedAt: string | null;
  watching: number;
  headlines: DigestEvent[];
  quieter: { count: number; symbols: { symbol: string; count: number }[] };
  emptyReason: "no_watchlist" | "all_quiet" | null;
};

export type SymbolResult = {
  symbol: string;
  name: string;
  sector: string | null;
  isActive: boolean;
};
