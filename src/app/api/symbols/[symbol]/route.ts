import type { NextRequest } from "next/server";
import { handler, json, notFound } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { getSymbolDetail } from "@/lib/symbol-detail";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/** The bigger picture for one symbol — opened by clicking a name anywhere. */
export const GET = handler(async (_req: NextRequest, ctx: Ctx) => {
  const user = await getOrCreateUser();
  const { symbol } = await ctx.params;
  const detail = await getSymbolDetail(symbol.toUpperCase(), user.id);
  if (!detail) return notFound("unknown symbol");
  return json(detail);
});
