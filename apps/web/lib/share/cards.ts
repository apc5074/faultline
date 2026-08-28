import "server-only";

import type { ChallengeDefinition, CostResult } from "@faultline/core";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ShareCardV1 = {
  version: 1;
  shareId: string;
  challengeSlug: string;
  challengeTitle: string;
  challengeDay: string;
  alias: string;
  outcome: "passed";
  solveTimeMs: number;
  monthlyCostUsd: number;
  budgetUsd: number;
  fastestRank: number | null;
  cheapestRank: number | null;
  latencyP95Ms?: number;
  latencyTargetMs?: number;
  headroom?: number;
  headroomTarget?: number;
  createdAt: string;
};

export class ShareCardError extends Error {
  override name = "ShareCardError";
  constructor(
    message: string,
    readonly code: "misconfigured" | "not_found" | "forbidden" | "invalid_submission" | "persist_failed",
  ) {
    super(message);
  }
}

type SubmissionRow = {
  id: string;
  user_id: string;
  daily_challenge_id: string;
  challenge_version_id: string;
  verified_metrics: unknown;
  verified_cost: unknown;
  all_requirements_pass: boolean;
  within_budget: boolean;
  official_solve_ms: number | null;
};

type ChallengeRow = {
  id: string;
  slug: string;
  config_json: unknown;
};

type DailyRow = { id: string; starts_at: string; challenge_version_id: string };
type RankRow = { user_id: string; fastest_solve_ms: number; cost_at_fastest: number | string; cheapest_cost: number | string; solve_time_at_cheapest: number };
type StoredShareRow = { id: string; payload: unknown; created_at: string };

function serviceClient() {
  try {
    return createSupabaseServiceClient();
  } catch (error) {
    throw new ShareCardError(error instanceof Error ? error.message : "Supabase is not configured.", "misconfigured");
  }
}

function numberField(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ShareCardError(`Invalid ${label} in verified submission.`, "invalid_submission");
  return parsed;
}

function payloadField(value: unknown): ShareCardV1 {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as { version?: unknown }).version !== 1) {
    throw new ShareCardError("Stored share payload is invalid.", "persist_failed");
  }
  return value as ShareCardV1;
}

async function rankFor(service: ReturnType<typeof serviceClient>, dailyChallengeId: string, userId: string) {
  const result = await service
    .from("daily_best")
    .select("user_id, fastest_solve_ms, cost_at_fastest, cheapest_cost, solve_time_at_cheapest")
    .eq("daily_challenge_id", dailyChallengeId);
  if (result.error) throw new ShareCardError(result.error.message, "persist_failed");

  const rows = (result.data ?? []) as RankRow[];
  const fastest = [...rows].sort((a, b) => numberField(a.fastest_solve_ms, "fastest_solve_ms") - numberField(b.fastest_solve_ms, "fastest_solve_ms") || numberField(a.cost_at_fastest, "cost_at_fastest") - numberField(b.cost_at_fastest, "cost_at_fastest") || a.user_id.localeCompare(b.user_id));
  const cheapest = [...rows].sort((a, b) => numberField(a.cheapest_cost, "cheapest_cost") - numberField(b.cheapest_cost, "cheapest_cost") || a.solve_time_at_cheapest - b.solve_time_at_cheapest || a.user_id.localeCompare(b.user_id));
  const fastestIndex = fastest.findIndex((row) => row.user_id === userId);
  const cheapestIndex = cheapest.findIndex((row) => row.user_id === userId);
  return { fastestRank: fastestIndex < 0 ? null : fastestIndex + 1, cheapestRank: cheapestIndex < 0 ? null : cheapestIndex + 1 };
}

async function readStoredShare(shareId: string): Promise<ShareCardV1> {
  const result = await serviceClient().from("share_cards").select("id, payload, created_at").eq("id", shareId).maybeSingle();
  if (result.error) throw new ShareCardError(result.error.message, "persist_failed");
  if (!result.data) throw new ShareCardError("Share card not found.", "not_found");
  const row = result.data as StoredShareRow;
  const payload = payloadField(row.payload);
  return { ...payload, shareId: row.id, createdAt: row.created_at };
}

/** Mints or reuses a public-safe card from an owned, verified passing submission. */
export async function createShareFromSubmission(submissionId: string, viewerAuth: { userId: string }): Promise<ShareCardV1> {
  const service = serviceClient();
  const submissionResult = await service
    .from("submissions")
    .select("id, user_id, daily_challenge_id, challenge_version_id, verified_metrics, verified_cost, all_requirements_pass, within_budget, official_solve_ms")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionResult.error) throw new ShareCardError(submissionResult.error.message, "persist_failed");
  if (!submissionResult.data) throw new ShareCardError("Submission not found.", "not_found");
  const submission = submissionResult.data as SubmissionRow;
  if (submission.user_id !== viewerAuth.userId) throw new ShareCardError("Submission does not belong to the current user.", "forbidden");
  if (!submission.all_requirements_pass || !submission.within_budget || submission.official_solve_ms === null) {
    throw new ShareCardError("Only verified passing submissions can be shared.", "invalid_submission");
  }

  const existing = await service.from("share_cards").select("id, payload, created_at").eq("submission_id", submissionId).maybeSingle();
  if (existing.error) throw new ShareCardError(existing.error.message, "persist_failed");
  if (existing.data) {
    const row = existing.data as StoredShareRow;
    return { ...payloadField(row.payload), shareId: row.id, createdAt: row.created_at };
  }

  const [challengeResult, dailyResult, profileResult] = await Promise.all([
    service.from("challenge_versions").select("id, slug, config_json").eq("id", submission.challenge_version_id).maybeSingle(),
    service.from("daily_challenges").select("id, starts_at, challenge_version_id").eq("id", submission.daily_challenge_id).maybeSingle(),
    service.from("profiles").select("alias").eq("user_id", submission.user_id).maybeSingle(),
  ]);
  if (challengeResult.error || dailyResult.error || profileResult.error) throw new ShareCardError("Unable to load verified share context.", "persist_failed");
  if (!challengeResult.data || !dailyResult.data || !profileResult.data) throw new ShareCardError("Verified share context is incomplete.", "persist_failed");

  const challenge = challengeResult.data as ChallengeRow;
  const daily = dailyResult.data as DailyRow;
  const config = challenge.config_json as ChallengeDefinition;
  const metrics = submission.verified_metrics as Record<string, unknown>;
  const cost = submission.verified_cost as CostResult;
  const ranks = await rankFor(service, submission.daily_challenge_id, submission.user_id);
  const latencyRequirement = config.requirements.find((requirement) => requirement.type === "latency");
  const headroomRequirement = config.requirements.find((requirement) => requirement.type === "headroom");
  const payload = {
    version: 1 as const,
    challengeSlug: challenge.slug,
    challengeTitle: config.title,
    challengeDay: daily.starts_at.slice(0, 10),
    alias: String((profileResult.data as { alias: string }).alias),
    outcome: "passed" as const,
    solveTimeMs: submission.official_solve_ms,
    monthlyCostUsd: numberField(cost.monthlyTotal, "monthlyTotal"),
    budgetUsd: numberField(config.monthlyBudget, "monthlyBudget"),
    ...ranks,
    latencyP95Ms: numberField(metrics.p95LatencyMs, "p95LatencyMs"),
    latencyTargetMs: latencyRequirement?.target,
    headroom: numberField(metrics.headroom, "headroom"),
    headroomTarget: headroomRequirement?.target,
  } satisfies Omit<ShareCardV1, "shareId" | "createdAt">;

  const inserted = await service.from("share_cards").insert({ submission_id: submissionId, payload }).select("id, payload, created_at").single();
  if (inserted.error) {
    const raced = await service.from("share_cards").select("id, payload, created_at").eq("submission_id", submissionId).maybeSingle();
    if (raced.data) {
      const row = raced.data as StoredShareRow;
      return { ...payloadField(row.payload), shareId: row.id, createdAt: row.created_at };
    }
    throw new ShareCardError(inserted.error.message, "persist_failed");
  }
  const row = inserted.data as StoredShareRow;
  return { ...payloadField(row.payload), shareId: row.id, createdAt: row.created_at };
}

/** Public-safe lookup. It returns only the server-authored share payload. */
export async function getShareCard(shareId: string): Promise<ShareCardV1> {
  return readStoredShare(shareId);
}
