import { getPlayerStreak, PlayerStreakError } from "@/lib/account/streak";
import type { PlayerStreakResponse } from "@/lib/account/streak-types";

export const dynamic = "force-dynamic";

export type { PlayerStreakResponse };

/** Recomputed verified daily streak for the current permanent account. */
export async function GET(): Promise<Response> {
  try {
    const streak = await getPlayerStreak();
    return Response.json(streak satisfies PlayerStreakResponse);
  } catch (error) {
    if (error instanceof PlayerStreakError) {
      const status = error.code === "misconfigured" ? 503 : 500;
      return Response.json(
        { ok: false, error: error.message, code: error.code } satisfies PlayerStreakResponse,
        { status },
      );
    }
    throw error;
  }
}
