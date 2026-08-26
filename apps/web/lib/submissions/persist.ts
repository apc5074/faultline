import "server-only";

import { hashArchitecture } from "@faultline/challenges";
import type { Architecture, CostResult, RequirementResult } from "@faultline/core";

import type { VerifiedCompetitionMetrics } from "@/lib/competition/verify-submission";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type { VerifiedCompetitionMetrics };

export type PersistVerifiedSubmissionInput = {
  userId: string;
  attemptId: string;
  dailyChallengeId: string;
  challengeVersionId: string;
  /** Integer version from challenge_versions.version (audit denormalization). */
  challengeVersion: number;
  simulatorVersion: string;
  architecture: Architecture;
  verifiedMetrics: VerifiedCompetitionMetrics;
  verifiedCost: CostResult;
  verifiedRequirements: readonly RequirementResult[];
  allRequirementsPass: boolean;
  withinBudget: boolean;
};

export type StoredSubmission = {
  id: string;
  userId: string;
  attemptId: string;
  dailyChallengeId: string;
  challengeVersionId: string;
  architectureHash: string;
  challengeVersion: number;
  simulatorVersion: string;
  allRequirementsPass: boolean;
  withinBudget: boolean;
  officialSolveMs: number | null;
  createdAt: string;
};

export type DailyBestProjection = {
  id: string;
  userId: string;
  dailyChallengeId: string;
  fastestSubmissionId: string;
  fastestSolveMs: number;
  costAtFastest: number;
  cheapestSubmissionId: string;
  cheapestCost: number;
  solveTimeAtCheapest: number;
  createdAt: string;
  updatedAt: string;
};

export type CommitVerifiedSubmissionResult = {
  submission: StoredSubmission;
  eligible: boolean;
  firstValidAt: string | null;
  dailyBest: DailyBestProjection | null;
};

export class SubmissionPersistError extends Error {
  override name = "SubmissionPersistError";
  constructor(
    message: string,
    readonly code: "misconfigured" | "persist_failed",
  ) {
    super(message);
  }
}

type RpcSubmission = {
  id: string;
  user_id: string;
  attempt_id: string;
  daily_challenge_id: string;
  challenge_version_id: string;
  architecture_hash: string;
  challenge_version: number;
  simulator_version: string;
  all_requirements_pass: boolean;
  within_budget: boolean;
  official_solve_ms: number | null;
  created_at: string;
};

type RpcDailyBest = {
  id: string;
  user_id: string;
  daily_challenge_id: string;
  fastest_submission_id: string;
  fastest_solve_ms: number;
  cost_at_fastest: number | string;
  cheapest_submission_id: string;
  cheapest_cost: number | string;
  solve_time_at_cheapest: number;
  created_at: string;
  updated_at: string;
};

type RpcCommitResult = {
  submission: RpcSubmission;
  eligible: boolean;
  first_valid_at: string | null;
  daily_best: RpcDailyBest | null;
};

type DailyBestRow = {
  id: string;
  user_id: string;
  daily_challenge_id: string;
  fastest_submission_id: string;
  fastest_solve_ms: number;
  cost_at_fastest: number | string;
  cheapest_submission_id: string;
  cheapest_cost: number | string;
  solve_time_at_cheapest: number;
  created_at: string;
  updated_at: string;
};

function asNumber(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new SubmissionPersistError("Invalid numeric ranking field from database.", "persist_failed");
  }
  return n;
}

function asDailyBest(row: RpcDailyBest | DailyBestRow): DailyBestProjection {
  return {
    id: row.id,
    userId: row.user_id,
    dailyChallengeId: row.daily_challenge_id,
    fastestSubmissionId: row.fastest_submission_id,
    fastestSolveMs: row.fastest_solve_ms,
    costAtFastest: asNumber(row.cost_at_fastest),
    cheapestSubmissionId: row.cheapest_submission_id,
    cheapestCost: asNumber(row.cheapest_cost),
    solveTimeAtCheapest: row.solve_time_at_cheapest,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asStoredSubmission(row: RpcSubmission): StoredSubmission {
  return {
    id: row.id,
    userId: row.user_id,
    attemptId: row.attempt_id,
    dailyChallengeId: row.daily_challenge_id,
    challengeVersionId: row.challenge_version_id,
    architectureHash: row.architecture_hash,
    challengeVersion: row.challenge_version,
    simulatorVersion: row.simulator_version,
    allRequirementsPass: row.all_requirements_pass,
    withinBudget: row.within_budget,
    officialSolveMs: row.official_solve_ms,
    createdAt: row.created_at,
  };
}

/**
 * Atomically persists a server-verified submission and, when eligible, updates
 * `attempts.first_valid_at` + `daily_best` via `commit_verified_submission` RPC.
 * Computes architecture_hash locally — never accepts a client hash or client solve time.
 */
export async function commitVerifiedSubmission(
  input: PersistVerifiedSubmissionInput,
): Promise<CommitVerifiedSubmissionResult> {
  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new SubmissionPersistError(
      error instanceof Error ? error.message : "Service role is not configured.",
      "misconfigured",
    );
  }

  const architectureHash = hashArchitecture(input.architecture);

  const { data, error } = await service.rpc("commit_verified_submission", {
    p_user_id: input.userId,
    p_attempt_id: input.attemptId,
    p_daily_challenge_id: input.dailyChallengeId,
    p_challenge_version_id: input.challengeVersionId,
    p_architecture_json: input.architecture,
    p_architecture_hash: architectureHash,
    p_challenge_version: input.challengeVersion,
    p_simulator_version: input.simulatorVersion,
    p_verified_metrics: input.verifiedMetrics,
    p_verified_cost: input.verifiedCost,
    p_verified_requirements: input.verifiedRequirements,
    p_all_requirements_pass: input.allRequirementsPass,
    p_within_budget: input.withinBudget,
  });

  if (error || !data) {
    throw new SubmissionPersistError(
      error?.message ?? "Failed to commit verified submission.",
      "persist_failed",
    );
  }

  const payload = data as RpcCommitResult;
  if (!payload.submission) {
    throw new SubmissionPersistError("Commit RPC returned no submission.", "persist_failed");
  }

  return {
    submission: asStoredSubmission(payload.submission),
    eligible: Boolean(payload.eligible),
    firstValidAt: payload.first_valid_at,
    dailyBest: payload.daily_best ? asDailyBest(payload.daily_best) : null,
  };
}

/** @deprecated Prefer commitVerifiedSubmission — kept as a thin alias for call-site clarity. */
export async function persistVerifiedSubmission(
  input: PersistVerifiedSubmissionInput,
): Promise<StoredSubmission> {
  const result = await commitVerifiedSubmission(input);
  return result.submission;
}

/** Loads the player's ranking projection for a daily challenge, if any. */
export async function getDailyBest(input: {
  userId: string;
  dailyChallengeId: string;
}): Promise<DailyBestProjection | null> {
  let service;
  try {
    service = createSupabaseServiceClient();
  } catch (error) {
    throw new SubmissionPersistError(
      error instanceof Error ? error.message : "Service role is not configured.",
      "misconfigured",
    );
  }

  const result = await service
    .from("daily_best")
    .select(
      "id, user_id, daily_challenge_id, fastest_submission_id, fastest_solve_ms, cost_at_fastest, cheapest_submission_id, cheapest_cost, solve_time_at_cheapest, created_at, updated_at",
    )
    .eq("user_id", input.userId)
    .eq("daily_challenge_id", input.dailyChallengeId)
    .maybeSingle();

  if (result.error) {
    throw new SubmissionPersistError(result.error.message, "persist_failed");
  }
  return result.data ? asDailyBest(result.data as DailyBestRow) : null;
}

/** Re-export for server verification callers (API-003). */
export { hashArchitecture };
