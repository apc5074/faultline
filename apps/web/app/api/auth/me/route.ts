import { ensureProfileForUser, getProfileAlias, ProfileAliasError } from "@/lib/auth/profile";
import {
  createSupabaseServerClient,
  getCurrentAuthUser,
  getSupabasePublicConfig,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type AuthMeResponse =
  | {
      authenticated: false;
      configured: boolean;
    }
  | {
      authenticated: true;
      configured: true;
      userId: string;
      isAnonymous: boolean;
      alias: string | null;
    };

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

  return Response.json({
    authenticated: true,
    configured: true,
    userId: user.id,
    isAnonymous: user.is_anonymous === true,
    alias,
  } satisfies AuthMeResponse);
}
