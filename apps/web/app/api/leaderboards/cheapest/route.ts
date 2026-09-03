import {
  CheapestLeaderboardError,
  getCheapestLeaderboard,
  type CheapestLeaderboardEntry,
} from "@/lib/leaderboards/cheapest";

export const dynamic = "force-dynamic";

export type CheapestLeaderboardResponse =
  | {
      ok: true;
      dailyChallengeId: string;
      challengeTitle: string;
      challengeSlug: string;
      challengeVersion: number;
      entries: readonly CheapestLeaderboardEntry[];
    }
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "not_found" | "query_failed";
    };

/**
 * Public cheapest leaderboard for the active daily challenge.
 * No authentication. Rows come from `daily_best.cheapest_*` (verified eligible only).
 */
export async function GET(): Promise<Response> {
  try {
    const board = await getCheapestLeaderboard();
    const body: CheapestLeaderboardResponse = {
      ok: true,
      dailyChallengeId: board.dailyChallengeId,
      challengeTitle: board.challengeTitle,
      challengeSlug: board.challengeSlug,
      challengeVersion: board.challengeVersion,
      entries: board.entries,
    };
    return Response.json(body);
  } catch (error) {
    if (error instanceof CheapestLeaderboardError) {
      const status =
        error.code === "misconfigured" ? 503 : error.code === "not_found" ? 404 : 500;
      const body: CheapestLeaderboardResponse = {
        ok: false,
        error: error.message,
        code: error.code,
      };
      return Response.json(body, { status });
    }
    throw error;
  }
}
