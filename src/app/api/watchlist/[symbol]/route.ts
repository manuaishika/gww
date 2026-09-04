import type { NextRequest } from "next/server";
import { handler, json, notFound } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { removeFromWatchlist, updateWatchlistItem } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

export const DELETE = handler(async (_req: NextRequest, ctx: Ctx) => {
  const user = await getOrCreateUser();
  const { symbol } = await ctx.params;
  await removeFromWatchlist(user.id, symbol.toUpperCase());
  return json({ removed: true });
});

export const PATCH = handler(async (req: NextRequest, ctx: Ctx) => {
  const user = await getOrCreateUser();
  const { symbol } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    thesis?: string | null;
    mutedUntil?: string | null;
  };

  const ok = await updateWatchlistItem(user.id, symbol.toUpperCase(), body);
  if (!ok) return notFound("not on your watchlist, or nothing to update");
  return json({ updated: true });
});
