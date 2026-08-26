import {
  FastestLeaderboardError,
  getFastestLeaderboard,
  type FastestLeaderboardEntry,
} from "@/lib/leaderboards/fastest";

export const dynamic = "force-dynamic";

export type FastestLeaderboardResponse =
  | {
      ok: true;
      dailyChallengeId: string;
      challengeSlug: string;
      challengeVersion: number;
      entries: readonly FastestLeaderboardEntry[];
    }
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "not_found" | "query_failed";
    };

/**
 * Public fastest leaderboard for the active daily challenge.
 * No authentication. Rows come from `daily_best` (verified eligible only).
 */
export async function GET(): Promise<Response> {
  try {
    const board = await getFastestLeaderboard();
    const body: FastestLeaderboardResponse = {
      ok: true,
      dailyChallengeId: board.dailyChallengeId,
      challengeSlug: board.challengeSlug,
      challengeVersion: board.challengeVersion,
      entries: board.entries,
    };
    return Response.json(body);
  } catch (error) {
    if (error instanceof FastestLeaderboardError) {
      const status =
        error.code === "misconfigured" ? 503 : error.code === "not_found" ? 404 : 500;
      const body: FastestLeaderboardResponse = {
        ok: false,
        error: error.message,
        code: error.code,
      };
      return Response.json(body, { status });
    }
    throw error;
  }
}
