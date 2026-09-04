import { handler, json } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { buildDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await getOrCreateUser();
  const digest = await buildDigest(user.id);
  return json({ ...digest, accountCode: user.accountCode });
});
