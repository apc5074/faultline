import { ensureProfileForUser, ProfileAliasError } from "@/lib/auth/profile";
import {
  OfficialAttemptError,
  startOrGetOfficialAttempt,
} from "@/lib/attempts/official";
import {
  createSupabaseServerClient,
  getSupabasePublicConfig,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type StartAttemptResponse =
  | {
      ok: true;
      created: boolean;
      attemptId: string;
      alias: string;
      startedAt: string;
      firstValidAt: string | null;
      dailyChallengeId: string;
      challengeVersion: number;
      challengeSlug: string;
    }
  | {
      ok: false;
      error: string;
      code:
        | "misconfigured"
        | "auth_failed"
        | "profile_failed"
        | "no_active_challenge"
        | "persist_failed";
    };

/**
 * Starts or returns the caller's official attempt for today's active challenge.
 * Ensures anonymous session + alias. Never trusts client timestamps or user IDs.
 */
export async function POST(): Promise<Response> {
  const config = getSupabasePublicConfig();
  if (!config) {
    return Response.json(
      { ok: false, error: "Supabase is not configured.", code: "misconfigured" } satisfies StartAttemptResponse,
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient(config);
  let user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      return Response.json(
        {
          ok: false,
          error: error?.message ?? "Anonymous sign-in failed.",
          code: "auth_failed",
        } satisfies StartAttemptResponse,
        { status: 502 },
      );
    }
    user = data.user;
  }

  let alias: string;
  try {
    alias = (await ensureProfileForUser(supabase, user.id)).alias;
  } catch (error) {
    const message = error instanceof ProfileAliasError ? error.message : "Could not create profile alias.";
    return Response.json(
      { ok: false, error: message, code: "profile_failed" } satisfies StartAttemptResponse,
      { status: 502 },
    );
  }

  try {
    const { attempt, created, active } = await startOrGetOfficialAttempt({ userId: user.id });
    return Response.json({
      ok: true,
      created,
      attemptId: attempt.id,
      alias,
      startedAt: attempt.startedAt,
      firstValidAt: attempt.firstValidAt,
      dailyChallengeId: active.dailyChallengeId,
      challengeVersion: active.challengeVersion.version,
      challengeSlug: active.challengeVersion.slug,
    } satisfies StartAttemptResponse);
  } catch (error) {
    if (error instanceof OfficialAttemptError) {
      const status =
        error.code === "misconfigured"
          ? 503
          : error.code === "no_active_challenge"
            ? 404
            : 502;
      return Response.json(
        {
          ok: false,
          error: error.message,
          code: error.code === "misconfigured" || error.code === "no_active_challenge" || error.code === "persist_failed"
            ? error.code
            : "persist_failed",
        } satisfies StartAttemptResponse,
        { status },
      );
    }
    throw error;
  }
}
