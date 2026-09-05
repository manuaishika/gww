import type {
  DataHealth,
  Digest,
  SectorGroup,
  SymbolDetail,
  SymbolResult,
  TrendingItem,
  WatchlistItem,
} from "./types";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}

export const api = {
  session: () => req<{ userId: string; accountCode: string }>("/api/session"),

  adopt: (code: string) =>
    req<{ userId: string; accountCode: string }>("/api/session/adopt", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  digest: () => req<Digest>("/api/digest"),

  dataHealth: () => req<DataHealth>("/api/data-health"),

  trending: () => req<{ items: TrendingItem[] }>("/api/trending"),

  universe: () => req<{ sectors: SectorGroup[] }>("/api/universe"),

  symbolDetail: (symbol: string) =>
    req<SymbolDetail>(`/api/symbols/${encodeURIComponent(symbol)}`),

  watchlist: () => req<{ items: WatchlistItem[] }>("/api/watchlist"),

  search: async (q: string) => {
    if (!q.trim()) return { results: [] as SymbolResult[] };
    return req<{ results: SymbolResult[] }>(
      `/api/symbols/search?q=${encodeURIComponent(q)}`,
    );
  },

  add: (symbol: string, thesis?: string, positionSize?: number) =>
    req<{ added: boolean }>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ symbol, thesis, positionSize }),
    }),

  remove: (symbol: string) =>
    req<{ removed: boolean }>(`/api/watchlist/${encodeURIComponent(symbol)}`, {
      method: "DELETE",
    }),

  updateThesis: (symbol: string, thesis: string | null) =>
    req<{ updated: boolean }>(`/api/watchlist/${encodeURIComponent(symbol)}`, {
      method: "PATCH",
      body: JSON.stringify({ thesis }),
    }),

  updatePositionSize: (symbol: string, positionSize: number | null) =>
    req<{ updated: boolean }>(`/api/watchlist/${encodeURIComponent(symbol)}`, {
      method: "PATCH",
      body: JSON.stringify({ positionSize }),
    }),

  markSeen: (body: { eventIds?: string[]; symbol?: string; all?: boolean }) =>
    req<{ dismissed: number; advanced: number }>("/api/seen", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
