import { handler, json } from "@/lib/api";
import { getDataHealth } from "@/lib/data-health";

export const dynamic = "force-dynamic";

/** Global, not per-user — spec §7's optional data health panel. */
export const GET = handler(async () => {
  const health = await getDataHealth();
  return json(health);
});
