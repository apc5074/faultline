import { getProfileAlias } from "@/lib/auth/profile";
import { getCurrentOfficialAttempt, OfficialAttemptError } from "@/lib/attempts/official";
import { getMyLeaderboardRanks, snapshotLeaderboardRanks } from "@/lib/leaderboards/me";
import {
  getLatestEligibleSubmission,
  SubmissionPersistError,
  type RestoredVerifiedSubmission,
} from "@/lib/submissions/persist";
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
      lastSubmission: RestoredVerifiedSubmission | null;
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
  // Guest gameplay is intentionally independent of Supabase. Check auth
  // first because getCurrentAuthUser safely returns null when the optional
  // account backend is not configured.
  const user = await getCurrentAuthUser();
  if (!user) {
    return Response.json({
      ok: true,
      active: false,
      authenticated: false,
      reason: "guest",
    } satisfies CurrentAttemptResponse);
  }

  // Anonymous auth is an implementation detail used to preserve a player's
  // same-browser progress. It should not turn a guest page load into an
  // account/backend error when the optional official-attempt persistence is
  // unavailable. Keep trying the restore below so anonymous attempts still
  // work whenever the backend is healthy.
  const isAnonymous = user.is_anonymous === true;
  const guestResponse = () =>
    Response.json({
      ok: true,
      active: false,
      authenticated: false,
      reason: "guest",
    } satisfies CurrentAttemptResponse);

  const configured = getSupabasePublicConfig() !== null;
  if (!configured) {
    if (isAnonymous) return guestResponse();
    return Response.json(
      { ok: false, error: "Supabase is not configured.", code: "misconfigured" } satisfies CurrentAttemptResponse,
      { status: 503 },
    );
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

    let lastSubmission: RestoredVerifiedSubmission | null = null;
    try {
      lastSubmission = await getLatestEligibleSubmission({
        userId: user.id,
        attemptId: attempt.id,
        dailyChallengeId: active.dailyChallengeId,
        challengeSlug: active.challengeVersion.slug,
        firstValidAt: attempt.firstValidAt,
      });
    } catch (error) {
      if (error instanceof SubmissionPersistError) {
        if (error.code === "misconfigured" && isAnonymous) return guestResponse();
        return Response.json(
          { ok: false, error: error.message, code: error.code === "misconfigured" ? "misconfigured" : "persist_failed" } satisfies CurrentAttemptResponse,
          { status: error.code === "misconfigured" ? 503 : 502 },
        );
      }
      throw error;
    }

    if (lastSubmission?.eligible) {
      try {
        const ranks = snapshotLeaderboardRanks(await getMyLeaderboardRanks());
        if (ranks) {
          lastSubmission = { ...lastSubmission, leaderboardRanks: ranks };
        }
      } catch {
        // Rank snapshot is display-only during attempt restore.
      }
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
      lastSubmission,
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
        if (isAnonymous) return guestResponse();
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
