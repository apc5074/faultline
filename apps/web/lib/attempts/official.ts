import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ActiveDailyChallengeError,
  getActiveDailyChallenge,
  type ActiveDailyChallenge,
} from "@/lib/challenges/daily";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type OfficialAttempt = {
  id: string;
  userId: string;
  dailyChallengeId: string;
  startedAt: string;
  firstValidAt: string | null;
  createdAt: string;
};

export class OfficialAttemptError extends Error {
  override name = "OfficialAttemptError";
  constructor(
    message: string,
    readonly code:
      | "unauthenticated"
      | "misconfigured"
      | "no_active_challenge"
      | "persist_failed"
      | "forbidden",
  ) {
    super(message);
  }
}

type AttemptRow = {
  id: string;
  user_id: string;
  daily_challenge_id: string;
  started_at: string;
  first_valid_at: string | null;
  created_at: string;
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

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function selectAttempt(
  service: SupabaseClient,
  userId: string,
  dailyChallengeId: string,
): Promise<OfficialAttempt | null> {
  const result = await service
    .from("attempts")
    .select("id, user_id, daily_challenge_id, started_at, first_valid_at, created_at")
    .eq("user_id", userId)
    .eq("daily_challenge_id", dailyChallengeId)
    .maybeSingle();

  if (result.error) {
    throw new OfficialAttemptError(result.error.message, "persist_failed");
  }
  return result.data ? asAttempt(result.data as AttemptRow) : null;
}

/**
 * Idempotently starts (or returns) the player's official attempt for the active daily challenge.
 * `started_at` is always database-generated; never accepted from the client.
 */
export async function startOrGetOfficialAttempt(input: {
  userId: string;
  active?: ActiveDailyChallenge;
}): Promise<{ attempt: OfficialAttempt; created: boolean; active: ActiveDailyChallenge }> {
  let active: ActiveDailyChallenge;
  try {
    active = input.active ?? (await getActiveDailyChallenge());
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      if (error.code === "misconfigured") {
        throw new OfficialAttemptError(error.message, "misconfigured");
      }
      throw new OfficialAttemptError(error.message, "no_active_challenge");
    }
    throw error;
  }

  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new OfficialAttemptError(
      error instanceof Error ? error.message : "Service role is not configured.",
      "misconfigured",
    );
  }

  const existing = await selectAttempt(service, input.userId, active.dailyChallengeId);
  if (existing) {
    return { attempt: existing, created: false, active };
  }

  const inserted = await service
    .from("attempts")
    .insert({
      user_id: input.userId,
      daily_challenge_id: active.dailyChallengeId,
    })
    .select("id, user_id, daily_challenge_id, started_at, first_valid_at, created_at")
    .maybeSingle();

  if (!inserted.error && inserted.data) {
    return { attempt: asAttempt(inserted.data as AttemptRow), created: true, active };
  }

  if (isUniqueViolation(inserted.error)) {
    const raced = await selectAttempt(service, input.userId, active.dailyChallengeId);
    if (raced) {
      return { attempt: raced, created: false, active };
    }
  }

  throw new OfficialAttemptError(
    inserted.error?.message ?? "Failed to create official attempt.",
    "persist_failed",
  );
}

/** Loads the player's attempt for the currently active daily challenge, if any. */
export async function getCurrentOfficialAttempt(userId: string): Promise<{
  attempt: OfficialAttempt | null;
  active: ActiveDailyChallenge;
}> {
  let active: ActiveDailyChallenge;
  try {
    active = await getActiveDailyChallenge();
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      if (error.code === "misconfigured") {
        throw new OfficialAttemptError(error.message, "misconfigured");
      }
      throw new OfficialAttemptError(error.message, "no_active_challenge");
    }
    throw error;
  }

  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new OfficialAttemptError(
      error instanceof Error ? error.message : "Service role is not configured.",
      "misconfigured",
    );
  }

  const attempt = await selectAttempt(service, userId, active.dailyChallengeId);
  return { attempt, active };
}
