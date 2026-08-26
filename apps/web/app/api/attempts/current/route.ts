import { getProfileAlias } from "@/lib/auth/profile";
import { getCurrentOfficialAttempt, OfficialAttemptError } from "@/lib/attempts/official";
import {
  createSupabaseServerClient,
  getCurrentAuthUser,
  getSupabasePublicConfig,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type CurrentAttemptResponse =
  | {
      ok: true;
      active: true;
      attemptId: string;
      alias: string | null;
      startedAt: string;
      firstValidAt: string | null;
      dailyChallengeId: string;
      challengeVersion: number;
      challengeSlug: string;
    }
  | {
      ok: true;
      active: false;
      authenticated: false;
      reason: "guest";
    }
  | {
      ok: true;
      active: false;
      authenticated: true;
      alias: string | null;
      reason: "no_attempt" | "no_active_challenge";
    }
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "persist_failed";
    };

/** Restores the caller's official attempt for the active daily challenge after refresh. */
export async function GET(): Promise<Response> {
  const configured = getSupabasePublicConfig() !== null;
  if (!configured) {
    return Response.json(
      { ok: false, error: "Supabase is not configured.", code: "misconfigured" } satisfies CurrentAttemptResponse,
      { status: 503 },
    );
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return Response.json({
      ok: true,
      active: false,
      authenticated: false,
      reason: "guest",
    } satisfies CurrentAttemptResponse);
  }

  const supabase = await createSupabaseServerClient();
  let alias: string | null = null;
  try {
    alias = await getProfileAlias(supabase, user.id);
  } catch {
    alias = null;
  }

  try {
    const { attempt, active } = await getCurrentOfficialAttempt(user.id);
    if (!attempt) {
      return Response.json({
        ok: true,
        active: false,
        authenticated: true,
        alias,
        reason: "no_attempt",
      } satisfies CurrentAttemptResponse);
    }

    return Response.json({
      ok: true,
      active: true,
      attemptId: attempt.id,
      alias,
      startedAt: attempt.startedAt,
      firstValidAt: attempt.firstValidAt,
      dailyChallengeId: active.dailyChallengeId,
      challengeVersion: active.challengeVersion.version,
      challengeSlug: active.challengeVersion.slug,
    } satisfies CurrentAttemptResponse);
  } catch (error) {
    if (error instanceof OfficialAttemptError) {
      if (error.code === "no_active_challenge") {
        return Response.json({
          ok: true,
          active: false,
          authenticated: true,
          alias,
          reason: "no_active_challenge",
        } satisfies CurrentAttemptResponse);
      }
      if (error.code === "misconfigured") {
        return Response.json(
          { ok: false, error: error.message, code: "misconfigured" } satisfies CurrentAttemptResponse,
          { status: 503 },
        );
      }
      return Response.json(
        { ok: false, error: error.message, code: "persist_failed" } satisfies CurrentAttemptResponse,
        { status: 502 },
      );
    }
    throw error;
  }
}
