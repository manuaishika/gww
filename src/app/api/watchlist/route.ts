import type { NextRequest } from "next/server";
import { badRequest, handler, json } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { addToWatchlist, listWatchlist } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await getOrCreateUser();
  const items = await listWatchlist(user.id);
  return json({ items });
});

export const POST = handler(async (req: NextRequest) => {
  const user = await getOrCreateUser();
  const body = (await req.json().catch(() => null)) as
    | { symbol?: string; thesis?: string; positionSize?: number }
    | null;

  const symbol = body?.symbol?.trim().toUpperCase();
  if (!symbol) return badRequest("symbol is required");

  try {
    const result = await addToWatchlist(
      user.id,
      symbol,
      body?.thesis ?? null,
      body?.positionSize ?? null,
    );
    return json(result, result.added ? 201 : 200);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "could not add");
  }
});
