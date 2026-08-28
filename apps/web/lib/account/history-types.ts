export type PlayerHistoryEntry = {
  challengeStartsAt: string;
  challengeSlug: string;
  challengeVersion: number;
  challengeTitle: string;
  verified: boolean;
  solveMs: number | null;
  monthlyCostUsd: number | null;
  requirementsPassed: number;
  requirementsTotal: number;
  submittedAt: string;
};

export const PLAYER_HISTORY_DEFAULT_LIMIT = 20;
export const PLAYER_HISTORY_MAX_LIMIT = 50;

/** Normalizes history pagination query params to bounded server values. */
export function normalizeHistoryPagination(
  limitParam: string | null | undefined,
  offsetParam: string | null | undefined,
): { limit: number; offset: number } {
  const parsedLimit = Number.parseInt(limitParam ?? "", 10);
  const parsedOffset = Number.parseInt(offsetParam ?? "", 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(PLAYER_HISTORY_MAX_LIMIT, Math.max(1, parsedLimit))
    : PLAYER_HISTORY_DEFAULT_LIMIT;
  const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
  return { limit, offset };
}

export type PlayerHistoryRpcRow = {
  challenge_starts_at: string;
  challenge_slug: string;
  challenge_version: number;
  challenge_title: string;
  verified: boolean;
  solve_ms: number | null;
  monthly_cost_usd: number | string | null;
  requirements_passed: number;
  requirements_total: number;
  submitted_at: string;
};

function asNumber(value: number | string | null, label: string): number | null {
  if (value === null) return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} in history response.`);
  }
  return parsed;
}

export function mapPlayerHistoryRow(row: PlayerHistoryRpcRow): PlayerHistoryEntry {
  return {
    challengeStartsAt: row.challenge_starts_at,
    challengeSlug: row.challenge_slug,
    challengeVersion: row.challenge_version,
    challengeTitle: row.challenge_title,
    verified: row.verified === true,
    solveMs: row.solve_ms,
    monthlyCostUsd: asNumber(row.monthly_cost_usd, "monthly_cost_usd"),
    requirementsPassed: row.requirements_passed,
    requirementsTotal: row.requirements_total,
    submittedAt: row.submitted_at,
  };
}

export type PlayerHistoryResponse =
  | {
      ok: true;
      authenticated: false;
      requiresSignIn: true;
    }
  | {
      ok: true;
      authenticated: true;
      isAnonymous: true;
      requiresPermanentAccount: true;
    }
  | {
      ok: true;
      authenticated: true;
      isAnonymous: false;
      alias: string | null;
      entries: PlayerHistoryEntry[];
      limit: number;
      offset: number;
      totalDays: number;
      hasMore: boolean;
    }
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "query_failed";
    };
