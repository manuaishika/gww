import type { NextRequest } from "next/server";
import { handler, json } from "@/lib/api";
import { runTick } from "@/lib/ingest/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The ingest tick. Wired to Vercel Cron (see vercel.json). Two guards:
 *   - CRON_SECRET: if set, the request must carry it (Vercel Cron does).
 *   - ENABLE_INGEST: the deployed demo runs on the committed snapshot so its
 *     staged edge-case examples (circuit lock, disputed quote) stay put for a
 *     reviewer. Set ENABLE_INGEST=true in a real deployment to actually poll.
 *
 * Locally: `npm run tick`.
 */
export const GET = handler(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  }

  if (process.env.ENABLE_INGEST !== "true") {
    return json({
      skipped:
        "ingest disabled on this deployment (runs on the committed snapshot). " +
        "Set ENABLE_INGEST=true to poll live. The code is real — see src/lib/ingest/tick.ts.",
    });
  }

  const result = await runTick();
  return json(result);
});
