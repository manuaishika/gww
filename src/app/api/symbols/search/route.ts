import type { NextRequest } from "next/server";
import { and, ilike, ne, or, sql } from "drizzle-orm";
import { handler, json } from "@/lib/api";
import { db } from "@/lib/db";
import { symbols } from "@/lib/db/schema";
import { NIFTY_SYMBOL } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

/** Local symbol search — no external API. NSE universe only. */
export const GET = handler(async (req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return json({ results: [] });

  const like = `%${q}%`;
  const rows = await db
    .select({
      symbol: symbols.symbol,
      name: symbols.name,
      sector: symbols.sector,
      isActive: symbols.isActive,
    })
    .from(symbols)
    .where(
      and(
        ne(symbols.symbol, NIFTY_SYMBOL),
        or(ilike(symbols.symbol, like), ilike(symbols.name, like)),
      ),
    )
    .orderBy(
      // exact-ish symbol matches first
      sql`case when upper(${symbols.symbol}) = upper(${q}) then 0
               when ${symbols.symbol} ilike ${q + "%"} then 1
               else 2 end`,
      symbols.symbol,
    )
    .limit(10);

  return json({ results: rows });
});
