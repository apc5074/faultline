import "server-only";

import { ActiveDailyChallengeError, getActiveDailyChallenge } from "@/lib/challenges/daily";
import { createSupabaseServerClient, getCurrentAuthUser, getSupabasePublicConfig } from "@/lib/supabase/server";

export type LeaderboardRanksSnapshot = {
  alias: string;
  fastestRank: number;
  cheapestRank: number;
};

export function snapshotLeaderboardRanks(ranks: MyLeaderboardRanks): LeaderboardRanksSnapshot | null {
  if (!ranks.authenticated || !ranks.ranked) {
    return null;
  }
  return {
    alias: ranks.alias,
    fastestRank: ranks.fastestRank,
    cheapestRank: ranks.cheapestRank,
  };
}

export type MyLeaderboardRanks =
  | {
      authenticated: false;
      ranked: false;
    }
  | {
      authenticated: true;
      ranked: false;
      alias: string | null;
      dailyChallengeId: string;
      challengeSlug: string;
      challengeVersion: number;
    }
  | {
      authenticated: true;
      ranked: true;
      alias: string;
      dailyChallengeId: string;
      challengeSlug: string;
      challengeVersion: number;
      fastestRank: number;
      cheapestRank: number;
      fastestSolveMs: number;
      costAtFastest: number;
      cheapestCost: number;
      solveTimeAtCheapestMs: number;
    };

export class MyLeaderboardRanksError extends Error {
  override name = "MyLeaderboardRanksError";
  constructor(
    message: string,
    readonly code: "misconfigured" | "not_found" | "query_failed",
  ) {
    super(message);
  }
}

type RpcRow = {
  alias: string;
  fastest_rank: number | string;
  cheapest_rank: number | string;
  fastest_solve_ms: number;
  cost_at_fastest: number | string;
  cheapest_cost: number | string;
  solve_time_at_cheapest: number;
};

function asNumber(value: number | string, label: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) {
    throw new MyLeaderboardRanksError(`Invalid ${label} in rank response.`, "query_failed");
  }
  return parsed;
}

/**
 * Loads the current authenticated player's ranks for the active daily challenge.
 * Ordering matches public fastest/cheapest leaderboards. Guests get authenticated:false.
 */
export async function getMyLeaderboardRanks(): Promise<MyLeaderboardRanks> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new MyLeaderboardRanksError("Supabase is not configured.", "misconfigured");
  }

  const user = await getCurrentAuthUser();
  let active;
  try {
    active = await getActiveDailyChallenge();
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      throw new MyLeaderboardRanksError(
        error.message,
        error.code === "misconfigured" ? "misconfigured" : "not_found",
      );
    }
    throw error;
  }

  if (!user) {
    return { authenticated: false, ranked: false };
  }

  const supabase = await createSupabaseServerClient(config);
  const profile = await supabase.from("profiles").select("alias").eq("user_id", user.id).maybeSingle();
  const alias = typeof profile.data?.alias === "string" ? profile.data.alias : null;

  const result = await supabase.rpc("get_my_leaderboard_ranks", {
    p_daily_challenge_id: active.dailyChallengeId,
  });

  if (result.error) {
    throw new MyLeaderboardRanksError(result.error.message, "query_failed");
  }

  const rows = (result.data ?? []) as RpcRow[];
  const row = rows[0];
  if (!row) {
    return {
      authenticated: true,
      ranked: false,
      alias,
      dailyChallengeId: active.dailyChallengeId,
      challengeSlug: active.challengeVersion.slug,
      challengeVersion: active.challengeVersion.version,
    };
  }

  return {
    authenticated: true,
    ranked: true,
    alias: row.alias,
    dailyChallengeId: active.dailyChallengeId,
    challengeSlug: active.challengeVersion.slug,
    challengeVersion: active.challengeVersion.version,
    fastestRank: asNumber(row.fastest_rank, "fastest_rank"),
    cheapestRank: asNumber(row.cheapest_rank, "cheapest_rank"),
    fastestSolveMs: asNumber(row.fastest_solve_ms, "fastest_solve_ms"),
    costAtFastest: asNumber(row.cost_at_fastest, "cost_at_fastest"),
    cheapestCost: asNumber(row.cheapest_cost, "cheapest_cost"),
    solveTimeAtCheapestMs: asNumber(row.solve_time_at_cheapest, "solve_time_at_cheapest"),
  };
}
