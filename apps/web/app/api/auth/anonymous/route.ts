import type { AnonymousAuthResponse } from "@/lib/auth/account-status";
import { ensureProfileForUser, ProfileAliasError } from "@/lib/auth/profile";
import {
  createSupabaseServerClient,
  getSupabasePublicConfig,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type { AnonymousAuthResponse };

/**
 * Ensures an anonymous Supabase identity and a stable public alias.
 * Reuses existing session/profile; does not mint a new user every call.
 * Does not create official attempts — that belongs to API-001.
 */
export async function POST(): Promise<Response> {
  const config = getSupabasePublicConfig();
  if (!config) {
    return Response.json(
      { ok: false, error: "Supabase is not configured.", code: "misconfigured" } satisfies AnonymousAuthResponse,
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient(config);
  let user = (await supabase.auth.getUser()).data.user;
  let authCreated = false;

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      return Response.json(
        {
          ok: false,
          error: error?.message ?? "Anonymous sign-in failed.",
          code: "auth_failed",
        } satisfies AnonymousAuthResponse,
        { status: 502 },
      );
    }
    user = data.user;
    authCreated = true;
  }

  try {
    const profile = await ensureProfileForUser(supabase, user.id);
    return Response.json({
      ok: true,
      created: authCreated,
      userId: user.id,
      isAnonymous: user.is_anonymous === true,
      alias: profile.alias,
      profileCreated: profile.created,
    } satisfies AnonymousAuthResponse);
  } catch (error) {
    const message = error instanceof ProfileAliasError ? error.message : "Could not create profile alias.";
    return Response.json(
      { ok: false, error: message, code: "profile_failed" } satisfies AnonymousAuthResponse,
      { status: 502 },
    );
  }
}
