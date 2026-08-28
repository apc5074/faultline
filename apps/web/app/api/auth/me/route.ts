import type { AuthMeResponse } from "@/lib/auth/account-status";
import { getAccountProvider, getGitHubUsername } from "@/lib/auth/provider";
import { clearAccountLinkIntent, readAccountLinkIntent } from "@/lib/auth/link-session";
import { ensureProfileForUser, getProfileAlias, ProfileAliasError } from "@/lib/auth/profile";
import {
  createSupabaseServerClient,
  getCurrentAuthUser,
  getSupabasePublicConfig,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type { AuthMeResponse };

/** Identifies the current Supabase user from session cookies. Never requires auth to call. */
export async function GET(): Promise<Response> {
  const configured = getSupabasePublicConfig() !== null;
  if (!configured) {
    return Response.json({ authenticated: false, configured: false } satisfies AuthMeResponse);
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return Response.json({ authenticated: false, configured: true } satisfies AuthMeResponse);
  }

  const supabase = await createSupabaseServerClient();
  let alias: string | null = null;
  try {
    alias = await getProfileAlias(supabase, user.id);
    // Backfill profile for sessions created before AUTH-002.
    if (!alias) {
      alias = (await ensureProfileForUser(supabase, user.id)).alias;
    }
  } catch (error) {
    if (!(error instanceof ProfileAliasError)) throw error;
    alias = null;
  }

  const linkIntentUserId = await readAccountLinkIntent();
  // The intent cookie authorizes the callback. Keep it while it matches the
  // current anonymous session: an account-status fetch can race with the
  // browser's redirect to GitHub, and clearing it then breaks the PKCE link.
  // It is never used as durable UI state, and is removed once stale.
  if (linkIntentUserId && (user.is_anonymous !== true || linkIntentUserId !== user.id)) {
    await clearAccountLinkIntent();
  }

  return Response.json({
    authenticated: true,
    configured: true,
    userId: user.id,
    isAnonymous: user.is_anonymous === true,
    alias,
    provider: getAccountProvider(user),
    githubUsername: getGitHubUsername(user),
    linkingState: "idle",
  } satisfies AuthMeResponse);
}
