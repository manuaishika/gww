/**
 * Identity. No OAuth. A first visit mints a `user_id` + account code,
 * stored in an httpOnly cookie. Because every watermark lives in Postgres, not
 * localStorage, entering the code on another device gives you the same diff
 * state — that's the whole cross-device story, and it costs one table.
 */
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";
import { generateAccountCode } from "./account-code";

const COOKIE = "wl_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type SessionUser = { id: string; accountCode: string };

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR,
};

/** Read the current user from the cookie, or null. Does not mint. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const [row] = await db
    .select({ id: users.id, accountCode: users.accountCode })
    .from(users)
    .where(eq(users.id, id));
  return row ?? null;
}

/** Read the current user, minting a fresh one (and setting the cookie) if absent. */
export async function getOrCreateUser(): Promise<SessionUser> {
  const existing = await currentUser();
  if (existing) return existing;

  // retry once on the astronomically unlikely account-code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const accountCode = generateAccountCode();
    try {
      const [row] = await db
        .insert(users)
        .values({ accountCode })
        .returning({ id: users.id, accountCode: users.accountCode });
      const jar = await cookies();
      jar.set(COOKIE, row.id, cookieOpts);
      return row;
    } catch {
      // unique violation on account_code — try again
    }
  }
  throw new Error("could not mint a user");
}

/** Adopt an existing account by its code (the "sync to this device" flow). */
export async function adoptAccount(code: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, accountCode: users.accountCode })
    .from(users)
    .where(eq(users.accountCode, code));
  if (!row) return null;
  const jar = await cookies();
  jar.set(COOKIE, row.id, cookieOpts);
  return row;
}
