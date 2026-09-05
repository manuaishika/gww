import type { NextRequest } from "next/server";
import { handler, json } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { markSeen } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

/**
 * Advance the watermark. Call on dismiss or an explicit "mark as
 * read", NEVER on page load.
 *
 *   { eventIds: [...] }  dismiss those events + advance their symbols
 *   { symbol: "TCS" }    mark that symbol read up to now
 *   { all: true }        mark the whole watchlist read up to now
 */
export const POST = handler(async (req: NextRequest) => {
  const user = await getOrCreateUser();
  const body = (await req.json().catch(() => ({}))) as {
    symbol?: string;
    eventIds?: string[];
    all?: boolean;
  };

  const result = await markSeen(user.id, {
    symbol: body.symbol?.toUpperCase(),
    eventIds: body.eventIds,
    all: body.all,
  });
  return json(result);
});
