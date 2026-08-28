import type { User } from "@supabase/supabase-js";

import type { AccountProvider } from "./account-status.ts";

/** Returns the linked identity provider for a permanent user, if known. */
export function getAccountProvider(user: User): AccountProvider | undefined {
  if (user.is_anonymous === true) return undefined;
  const hasGitHub = user.identities?.some((identity) => identity.provider === "github") ?? false;
  return hasGitHub ? "github" : undefined;
}
