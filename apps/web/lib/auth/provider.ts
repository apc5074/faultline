import type { User } from "@supabase/supabase-js";

import type { AccountProvider } from "./account-status.ts";

/** Returns the linked identity provider for a permanent user, if known. */
export function getAccountProvider(user: User): AccountProvider | undefined {
  if (user.is_anonymous === true) return undefined;
  const hasGitHub = user.identities?.some((identity) => identity.provider === "github") ?? false;
  return hasGitHub ? "github" : undefined;
}

/**
 * Returns the current user's GitHub handle for their private account UI.
 * Provider metadata is untrusted, so only expose a value matching GitHub's
 * public username format; it is never used as a Faultline alias.
 */
export function getGitHubUsername(user: User): string | undefined {
  if (getAccountProvider(user) !== "github") return undefined;

  const metadata = user.user_metadata as Record<string, unknown>;
  const value = metadata.user_name ?? metadata.preferred_username ?? metadata.login;
  if (typeof value !== "string") return undefined;

  const username = value.trim();
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username) ? username : undefined;
}
