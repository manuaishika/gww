import type { NextRequest } from "next/server";
import { handler, json } from "@/lib/api";
import { getOrCreateUser } from "@/lib/session";
import { buildDigest, type DigestWindow } from "@/lib/digest";

export const dynamic = "force-dynamic";

const WINDOWS = new Set(["checked", "1", "7", "30"]);

export const GET = handler(async (req: NextRequest) => {
  const user = await getOrCreateUser();
  const raw = req.nextUrl.searchParams.get("window") ?? "checked";
  const window: DigestWindow = !WINDOWS.has(raw)
    ? "checked"
    : raw === "checked"
      ? "checked"
      : (Number(raw) as DigestWindow);

  const digest = await buildDigest(user.id, window);
  return json({ ...digest, accountCode: user.accountCode });
});
