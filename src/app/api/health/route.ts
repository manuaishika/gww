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
    const rows = await db.execute<{
      symbols: number;
      bars: number;
      last_session: string | null;
    }>(sql`
      select
        (select count(*)::int from symbols) as symbols,
        (select count(*)::int from bars_daily) as bars,
        (select max(session_date)::text from bars_daily) as last_session
    `);
    const r = rows[0];
    return Response.json({
      ok: true,
      db: "connected",
      symbols: r?.symbols ?? 0,
      bars: r?.bars ?? 0,
      lastSession: r?.last_session ?? null,
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
