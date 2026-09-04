import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + DB reachability. The landing page pings this; it never throws, so
 * the page renders whether or not a database is configured.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await db.execute<{ symbols: number }>(
      sql`select count(*)::int as symbols from symbols`,
    );
    const symbols = rows[0]?.symbols ?? 0;
    return Response.json({
      ok: true,
      db: "connected",
      symbols,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        db: "unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 200 },
    );
  }
}
