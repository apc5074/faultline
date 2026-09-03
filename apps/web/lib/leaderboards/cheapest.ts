import "server-only";

import { ActiveDailyChallengeError, getActiveDailyChallenge } from "@/lib/challenges/daily";
import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";
import { FASTEST_LEADERBOARD_LIMIT } from "@/lib/leaderboards/fastest";

export const CHEAPEST_LEADERBOARD_LIMIT = FASTEST_LEADERBOARD_LIMIT;

export type CheapestLeaderboardEntry = {
  rank: number;
  alias: string;
  cheapestCost: number;
  solveTimeAtCheapestMs: number;
};

export type CheapestLeaderboard = {
  dailyChallengeId: string;
  challengeTitle: string;
  challengeSlug: string;
  challengeVersion: number;
  entries: readonly CheapestLeaderboardEntry[];
};

export class CheapestLeaderboardError extends Error {
  override name = "CheapestLeaderboardError";
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
  cheapest_cost: number | string;
  solve_time_at_cheapest: number;
};

function asEntry(row: RpcRow): CheapestLeaderboardEntry {
  const rank = typeof row.rank === "string" ? Number(row.rank) : row.rank;
  const cost = typeof row.cheapest_cost === "string" ? Number(row.cheapest_cost) : row.cheapest_cost;
  if (!Number.isFinite(rank) || rank < 1) {
    throw new CheapestLeaderboardError("Leaderboard rank is invalid.", "query_failed");
  }
  if (typeof row.alias !== "string" || row.alias.length === 0) {
    throw new CheapestLeaderboardError("Leaderboard alias is missing.", "query_failed");
  }
  if (!Number.isFinite(cost) || cost < 0) {
    throw new CheapestLeaderboardError("Leaderboard cost is invalid.", "query_failed");
  }
  if (!Number.isFinite(row.solve_time_at_cheapest) || row.solve_time_at_cheapest < 0) {
    throw new CheapestLeaderboardError("Leaderboard solve time is invalid.", "query_failed");
  }
  return {
    rank,
    alias: row.alias,
    cheapestCost: cost,
    solveTimeAtCheapestMs: row.solve_time_at_cheapest,
  };
}

/**
 * Loads the public cheapest leaderboard for the active daily challenge.
 * Uses `daily_best.cheapest_*` via `list_cheapest_leaderboard` — independent of fastest fields.
 */
export async function getCheapestLeaderboard(
  limit: number = CHEAPEST_LEADERBOARD_LIMIT,
): Promise<CheapestLeaderboard> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new CheapestLeaderboardError("Supabase is not configured.", "misconfigured");
  }

  let active;
  try {
    active = await getActiveDailyChallenge();
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      throw new CheapestLeaderboardError(
        error.message,
        error.code === "misconfigured" ? "misconfigured" : "not_found",
      );
    }
    throw error;
  }

  const capped = Math.max(1, Math.min(Math.floor(limit), CHEAPEST_LEADERBOARD_LIMIT));
  const supabase = await createSupabaseServerClient(config);
  const result = await supabase.rpc("list_cheapest_leaderboard", {
    p_daily_challenge_id: active.dailyChallengeId,
    p_limit: capped,
  });

  if (result.error) {
    throw new CheapestLeaderboardError(result.error.message, "query_failed");
  }

  const rows = (result.data ?? []) as RpcRow[];
  return {
    dailyChallengeId: active.dailyChallengeId,
    challengeTitle: active.challengeVersion.config.title,
    challengeSlug: active.challengeVersion.slug,
    challengeVersion: active.challengeVersion.version,
    entries: rows.map(asEntry),
  };
}
