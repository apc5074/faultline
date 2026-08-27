import type { CostResult, RequirementResult } from "@faultline/core";

import { OfficialAttemptError } from "@/lib/attempts/official";
import { verifySubmission } from "@/lib/competition/verify-submission";
import {
  getCurrentAuthUser,
  getSupabasePublicConfig,
} from "@/lib/supabase/server";
import {
  commitVerifiedSubmission,
  SubmissionPersistError,
  type DailyBestProjection,
} from "@/lib/submissions/persist";
import {
  countAttemptSubmissions,
  getAttemptSubmissionContext,
  OFFICIAL_SUBMISSION_LIMIT,
  OFFICIAL_SUBMISSION_MAX_BODY_BYTES,
} from "@/lib/submissions/context";

export const dynamic = "force-dynamic";

export type SubmitOfficialResponse =
  | {
      ok: true;
      submissionId: string;
      eligible: boolean;
      allRequirementsPass: boolean;
      withinBudget: boolean;
      officialSolveMs: number | null;
      firstValidAt: string | null;
      architectureHash: string;
      challengeVersion: number;
      challengeSlug: string;
      simulatorVersion: string;
      metrics: {
        p95LatencyMs: number;
        throughputRatio: number;
        headroom: number;
      };
      cost: CostResult;
      requirements: readonly RequirementResult[];
      dailyBest: {
        fastestSolveMs: number;
        costAtFastest: number;
        cheapestCost: number;
        solveTimeAtCheapest: number;
      } | null;
    }
  | {
      ok: false;
      error: string;
      code:
        | "misconfigured"
        | "unauthenticated"
        | "invalid_request"
        | "payload_too_large"
        | "attempt_not_found"
        | "forbidden"
        | "challenge_version_mismatch"
        | "submission_limit"
        | "invalid_architecture"
        | "simulator_mismatch"
        | "persist_failed";
      details?: unknown;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequestBody(raw: unknown):
  | { ok: true; attemptId: string; challengeVersion: number; architecture: unknown }
  | { ok: false; error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const attemptId = raw.attemptId;
  const challengeVersion = raw.challengeVersion;
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    return { ok: false, error: "attemptId is required." };
  }
  if (typeof challengeVersion !== "number" || !Number.isInteger(challengeVersion) || challengeVersion < 1) {
    return { ok: false, error: "challengeVersion must be a positive integer." };
  }
  if (!("architecture" in raw)) {
    return { ok: false, error: "architecture is required." };
  }
  return {
    ok: true,
    attemptId: attemptId.trim(),
    challengeVersion,
    architecture: raw.architecture,
  };
}

function summarizeDailyBest(best: DailyBestProjection | null) {
  if (!best) return null;
  return {
    fastestSolveMs: best.fastestSolveMs,
    costAtFastest: best.costAtFastest,
    cheapestCost: best.cheapestCost,
    solveTimeAtCheapest: best.solveTimeAtCheapest,
  };
}

/**
 * Official competition submit: authenticate → bind attempt/challenge → verify shared
 * simulator truth → atomically persist + ranking projection. Client metrics are ignored.
 */
export async function POST(request: Request): Promise<Response> {
  if (!getSupabasePublicConfig()) {
    return Response.json(
      { ok: false, error: "Supabase is not configured.", code: "misconfigured" } satisfies SubmitOfficialResponse,
      { status: 503 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > OFFICIAL_SUBMISSION_MAX_BODY_BYTES) {
    return Response.json(
      {
        ok: false,
        error: "Submission payload is too large.",
        code: "payload_too_large",
      } satisfies SubmitOfficialResponse,
      { status: 413 },
    );
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return Response.json(
      { ok: false, error: "Could not read request body.", code: "invalid_request" } satisfies SubmitOfficialResponse,
      { status: 400 },
    );
  }

  if (rawText.length > OFFICIAL_SUBMISSION_MAX_BODY_BYTES) {
    return Response.json(
      {
        ok: false,
        error: "Submission payload is too large.",
        code: "payload_too_large",
      } satisfies SubmitOfficialResponse,
      { status: 413 },
    );
  }

  let rawJson: unknown;
  try {
    rawJson = rawText.length === 0 ? null : JSON.parse(rawText);
  } catch {
    return Response.json(
      { ok: false, error: "Request body must be valid JSON.", code: "invalid_request" } satisfies SubmitOfficialResponse,
      { status: 400 },
    );
  }

  const parsed = parseRequestBody(rawJson);
  if (!parsed.ok) {
    return Response.json(
      { ok: false, error: parsed.error, code: "invalid_request" } satisfies SubmitOfficialResponse,
      { status: 400 },
    );
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return Response.json(
      {
        ok: false,
        error: "Sign in via Start Official Attempt before submitting.",
        code: "unauthenticated",
      } satisfies SubmitOfficialResponse,
      { status: 401 },
    );
  }

  try {
    const { attempt, challengeVersion } = await getAttemptSubmissionContext({
      attemptId: parsed.attemptId,
      userId: user.id,
    });

    if (challengeVersion.version !== parsed.challengeVersion) {
      return Response.json(
        {
          ok: false,
          error: `Challenge version mismatch: attempt is bound to v${challengeVersion.version}, request sent v${parsed.challengeVersion}.`,
          code: "challenge_version_mismatch",
        } satisfies SubmitOfficialResponse,
        { status: 409 },
      );
    }

    const submissionCount = await countAttemptSubmissions(attempt.id);
    if (submissionCount >= OFFICIAL_SUBMISSION_LIMIT) {
      return Response.json(
        {
          ok: false,
          error: `Official submission limit of ${OFFICIAL_SUBMISSION_LIMIT} reached for this attempt.`,
          code: "submission_limit",
        } satisfies SubmitOfficialResponse,
        { status: 429 },
      );
    }

    const verified = verifySubmission({
      architecture: parsed.architecture,
      challengeVersion,
    });

    if (!verified.ok) {
      if (verified.code === "simulator_mismatch") {
        return Response.json(
          {
            ok: false,
            error: verified.message,
            code: "simulator_mismatch",
          } satisfies SubmitOfficialResponse,
          { status: 503 },
        );
      }
      return Response.json(
        {
          ok: false,
          error: verified.message,
          code: "invalid_architecture",
          details: verified.errors,
        } satisfies SubmitOfficialResponse,
        { status: 400 },
      );
    }

    const committed = await commitVerifiedSubmission({
      userId: user.id,
      attemptId: attempt.id,
      dailyChallengeId: attempt.dailyChallengeId,
      challengeVersionId: challengeVersion.id,
      challengeVersion: challengeVersion.version,
      simulatorVersion: verified.simulatorVersion,
      architecture: verified.architecture,
      verifiedMetrics: verified.metrics,
      verifiedCost: verified.cost,
      verifiedRequirements: verified.requirements,
      allRequirementsPass: verified.allRequirementsPass,
      withinBudget: verified.withinBudget,
    });

    return Response.json({
      ok: true,
      submissionId: committed.submission.id,
      eligible: committed.eligible,
      allRequirementsPass: verified.allRequirementsPass,
      withinBudget: verified.withinBudget,
      officialSolveMs: committed.submission.officialSolveMs,
      firstValidAt: committed.firstValidAt,
      architectureHash: verified.architectureHash,
      challengeVersion: challengeVersion.version,
      challengeSlug: challengeVersion.slug,
      simulatorVersion: verified.simulatorVersion,
      metrics: verified.metrics,
      cost: verified.cost,
      requirements: verified.requirements,
      dailyBest: summarizeDailyBest(committed.dailyBest),
    } satisfies SubmitOfficialResponse);
  } catch (error) {
    if (error instanceof OfficialAttemptError) {
      if (error.code === "misconfigured") {
        return Response.json(
          { ok: false, error: error.message, code: "misconfigured" } satisfies SubmitOfficialResponse,
          { status: 503 },
        );
      }
      if (error.code === "forbidden") {
        const notFound = error.message.toLowerCase().includes("not found");
        return Response.json(
          {
            ok: false,
            error: error.message,
            code: notFound ? "attempt_not_found" : "forbidden",
          } satisfies SubmitOfficialResponse,
          { status: notFound ? 404 : 403 },
        );
      }
      return Response.json(
        { ok: false, error: error.message, code: "persist_failed" } satisfies SubmitOfficialResponse,
        { status: 502 },
      );
    }
    if (error instanceof SubmissionPersistError) {
      return Response.json(
        {
          ok: false,
          error: error.message,
          code:
            error.code === "misconfigured"
              ? "misconfigured"
              : error.code === "submission_limit"
                ? "submission_limit"
                : "persist_failed",
        } satisfies SubmitOfficialResponse,
        { status: error.code === "misconfigured" ? 503 : error.code === "submission_limit" ? 429 : 502 },
      );
    }
    throw error;
  }
}
