import type { NextRequest } from "next/server";
import { badRequest, handler, json, notFound } from "@/lib/api";
import { normalizeAccountCode } from "@/lib/account-code";
import { adoptAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Enter a code from another device → adopt that user_id on this one. */
export const POST = handler(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { code?: string } | null;
  const code = normalizeAccountCode(body?.code ?? "");
  if (!code) return badRequest("that doesn't look like an account code");

  const user = await adoptAccount(code);
  if (!user) return notFound("no account with that code");
  return json({ userId: user.id, accountCode: user.accountCode });
});
