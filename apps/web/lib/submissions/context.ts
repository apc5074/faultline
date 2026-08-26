import "server-only";

import {
  ActiveDailyChallengeError,
  getChallengeVersionById,
  type ChallengeVersionRecord,
} from "@/lib/challenges/daily";
import { OfficialAttemptError, type OfficialAttempt } from "@/lib/attempts/official";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** Phase 4 soft cap on official submissions per attempt. */
export const OFFICIAL_SUBMISSION_LIMIT = 50;

/** Reject oversized competition payloads early (bytes of raw request body). */
export const OFFICIAL_SUBMISSION_MAX_BODY_BYTES = 512_000;

export type AttemptSubmissionContext = {
  attempt: OfficialAttempt;
  challengeVersion: ChallengeVersionRecord;
};

type AttemptRow = {
  id: string;
  user_id: string;
  daily_challenge_id: string;
  started_at: string;
  first_valid_at: string | null;
  created_at: string;
};

type DailyChallengeBindingRow = {
  id: string;
  challenge_version_id: string;
};

function asAttempt(row: AttemptRow): OfficialAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    dailyChallengeId: row.daily_challenge_id,
    startedAt: row.started_at,
    firstValidAt: row.first_valid_at,
    createdAt: row.created_at,
  };
}

/**
 * Loads an attempt and its immutable challenge version binding.
 * Enforces ownership against the authenticated user id.
 */
export async function getAttemptSubmissionContext(input: {
  attemptId: string;
  userId: string;
}): Promise<AttemptSubmissionContext> {
  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new OfficialAttemptError(
      error instanceof Error ? error.message : "Service role is not configured.",
      "misconfigured",
    );
  }

  const attemptResult = await service
    .from("attempts")
    .select("id, user_id, daily_challenge_id, started_at, first_valid_at, created_at")
    .eq("id", input.attemptId)
    .maybeSingle();

  if (attemptResult.error) {
    throw new OfficialAttemptError(attemptResult.error.message, "persist_failed");
  }
  if (!attemptResult.data) {
    throw new OfficialAttemptError("Attempt not found.", "forbidden");
  }

  const attempt = asAttempt(attemptResult.data as AttemptRow);
  if (attempt.userId !== input.userId) {
    throw new OfficialAttemptError("Attempt does not belong to the current user.", "forbidden");
  }

  const dailyResult = await service
    .from("daily_challenges")
    .select("id, challenge_version_id")
    .eq("id", attempt.dailyChallengeId)
    .maybeSingle();

  if (dailyResult.error) {
    throw new OfficialAttemptError(dailyResult.error.message, "persist_failed");
  }
  if (!dailyResult.data) {
    throw new OfficialAttemptError("Attempt daily challenge not found.", "persist_failed");
  }

  const binding = dailyResult.data as DailyChallengeBindingRow;

  let challengeVersion: ChallengeVersionRecord;
  try {
    challengeVersion = await getChallengeVersionById(binding.challenge_version_id);
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      if (error.code === "misconfigured" || error.code === "simulator_mismatch") {
        throw new OfficialAttemptError(error.message, "misconfigured");
      }
      throw new OfficialAttemptError(error.message, "persist_failed");
    }
    throw error;
  }

  return { attempt, challengeVersion };
}

/** Counts persisted official submissions for one attempt (limit enforcement). */
export async function countAttemptSubmissions(attemptId: string): Promise<number> {
  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new OfficialAttemptError(
      error instanceof Error ? error.message : "Service role is not configured.",
      "misconfigured",
    );
  }

  const result = await service
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId);

  if (result.error) {
    throw new OfficialAttemptError(result.error.message, "persist_failed");
  }
  return result.count ?? 0;
}
