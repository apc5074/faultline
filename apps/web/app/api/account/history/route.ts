import { getPlayerHistory, PlayerHistoryError } from "@/lib/account/history";
import type { PlayerHistoryResponse } from "@/lib/account/history-types";

export const dynamic = "force-dynamic";

export type { PlayerHistoryResponse };

/** Verified play history for the current permanent account. */
export async function GET(request: Request): Promise<Response> {
  try {
    const searchParams = new URL(request.url).searchParams;
    const history = await getPlayerHistory(searchParams);
    return Response.json(history satisfies PlayerHistoryResponse);
  } catch (error) {
    if (error instanceof PlayerHistoryError) {
      const status = error.code === "misconfigured" ? 503 : 500;
      return Response.json(
        { ok: false, error: error.message, code: error.code } satisfies PlayerHistoryResponse,
        { status },
      );
    }
    throw error;
  }
}
