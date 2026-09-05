import { handler, json } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { getUniverse } from "@/lib/universe";

export const dynamic = "force-dynamic";

/** Browse-by-sector data for the Discover tab, with a per-user "already watching" flag. */
export const GET = handler(async () => {
  const user = await getOrCreateUser();
  const sectors = await getUniverse(user.id);
  return json({ sectors });
});
