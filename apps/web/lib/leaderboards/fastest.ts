import "server-only";

import { ActiveDailyChallengeError, getActiveDailyChallenge } from "@/lib/challenges/daily";
import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";

export const FASTEST_LEADERBOARD_LIMIT = 100;

export type FastestLeaderboardEntry = {
  rank: number;
  alias: string;
  fastestSolveMs: number;
  costAtFastest: number;
};

export type FastestLeaderboard = {
  dailyChallengeId: string;
  challengeSlug: string;
  challengeVersion: number;
  entries: readonly FastestLeaderboardEntry[];
};

export class FastestLeaderboardError extends Error {
  override name = "FastestLeaderboardError";
  constructor(
    message: string,
    readonly code: "misconfigured" | "not_found" | "query_failed",
  ) {
    super(message);
  }
}

type RpcRow = {
  rank: number | string;
  alias: string;
  fastest_solve_ms: number;
  cost_at_fastest: number | string;
};

function asEntry(row: RpcRow): FastestLeaderboardEntry {
  const rank = typeof row.rank === "string" ? Number(row.rank) : row.rank;
  const cost =
    typeof row.cost_at_fastest === "string" ? Number(row.cost_at_fastest) : row.cost_at_fastest;
  if (!Number.isFinite(rank) || rank < 1) {
    throw new FastestLeaderboardError("Leaderboard rank is invalid.", "query_failed");
  }
  if (typeof row.alias !== "string" || row.alias.length === 0) {
    throw new FastestLeaderboardError("Leaderboard alias is missing.", "query_failed");
  }
  if (!Number.isFinite(row.fastest_solve_ms) || row.fastest_solve_ms < 0) {
    throw new FastestLeaderboardError("Leaderboard solve time is invalid.", "query_failed");
  }
  if (!Number.isFinite(cost) || cost < 0) {
    throw new FastestLeaderboardError("Leaderboard cost is invalid.", "query_failed");
  }
  return {
    rank,
    alias: row.alias,
    fastestSolveMs: row.fastest_solve_ms,
    costAtFastest: cost,
  };
}

/**
 * Loads the public fastest leaderboard for the active daily challenge.
 * Uses `daily_best` via `list_fastest_leaderboard` — no auth required; UUIDs never returned.
 */
export async function getFastestLeaderboard(
  limit: number = FASTEST_LEADERBOARD_LIMIT,
): Promise<FastestLeaderboard> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new FastestLeaderboardError("Supabase is not configured.", "misconfigured");
  }

  let active;
  try {
    active = await getActiveDailyChallenge();
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      throw new FastestLeaderboardError(
        error.message,
        error.code === "misconfigured" ? "misconfigured" : "not_found",
      );
    }
    throw error;
  }

  const capped = Math.max(1, Math.min(Math.floor(limit), FASTEST_LEADERBOARD_LIMIT));
  const supabase = await createSupabaseServerClient(config);
  const result = await supabase.rpc("list_fastest_leaderboard", {
    p_daily_challenge_id: active.dailyChallengeId,
    p_limit: capped,
  });

  if (result.error) {
    throw new FastestLeaderboardError(result.error.message, "query_failed");
  }

  const rows = (result.data ?? []) as RpcRow[];
  return {
    dailyChallengeId: active.dailyChallengeId,
    challengeSlug: active.challengeVersion.slug,
    challengeVersion: active.challengeVersion.version,
    entries: rows.map(asEntry),
  };
}
