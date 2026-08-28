import "server-only";

import { cookies } from "next/headers";

import { ACCOUNT_LINK_COOKIE } from "./account-status.ts";

export { ACCOUNT_LINK_COOKIE };
export const ACCOUNT_LINK_MAX_AGE_SECONDS = 600;

/** Records the anonymous user id before redirecting to GitHub for linking. */
export async function setAccountLinkIntent(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_LINK_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCOUNT_LINK_MAX_AGE_SECONDS,
  });
}

export async function readAccountLinkIntent(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCOUNT_LINK_COOKIE)?.value ?? null;
}

export async function clearAccountLinkIntent(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCOUNT_LINK_COOKIE);
}
