import { handler, json } from "@/lib/api";
import { getTrending } from "@/lib/trending";

export const dynamic = "force-dynamic";

/**
 * Global, un-personalized — no session required. What the detector engine
 * actually found recently, across the whole universe, for a visitor who
 * hasn't added anything yet. See src/lib/trending.ts.
 */
export const GET = handler(async () => {
  const items = await getTrending(6);
  return json({ items });
});
