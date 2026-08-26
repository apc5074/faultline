import {
  getMyLeaderboardRanks,
  MyLeaderboardRanksError,
  type MyLeaderboardRanks,
} from "@/lib/leaderboards/me";

export const dynamic = "force-dynamic";

export type MyLeaderboardResponse =
  | ({ ok: true } & MyLeaderboardRanks)
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "not_found" | "query_failed";
    };

/**
 * Current player's fastest + cheapest ranks for the active daily challenge.
 * Requires competition identity for ranked data; guests get authenticated:false.
 */
export async function GET(): Promise<Response> {
  try {
    const ranks = await getMyLeaderboardRanks();
    return Response.json({ ok: true, ...ranks } satisfies MyLeaderboardResponse);
  } catch (error) {
    if (error instanceof MyLeaderboardRanksError) {
      const status =
        error.code === "misconfigured" ? 503 : error.code === "not_found" ? 404 : 500;
      return Response.json(
        { ok: false, error: error.message, code: error.code } satisfies MyLeaderboardResponse,
        { status },
      );
    }
    throw error;
  }
}
