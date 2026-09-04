import { handler, json } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Who am I? Mints a new account (and sets the cookie) on a first visit. */
export const GET = handler(async () => {
  const user = await getOrCreateUser();
  return json({ userId: user.id, accountCode: user.accountCode });
});
