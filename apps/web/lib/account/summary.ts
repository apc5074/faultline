import "server-only";

import { mapPlayerStreakRow, type PlayerStreakRpcRow } from "@/lib/account/streak-types";
import type { PlayerAccountSummaryResponse } from "@/lib/account/summary-types";
import { createSupabaseServerClient, getCurrentAuthUser, getSupabasePublicConfig } from "@/lib/supabase/server";

type OverviewRow = { completion_days: string[] | null; best_rank: number | string | null };

/** Loads all data needed by the Account page with one auth lookup and one RPC round trip. */
export async function getPlayerAccountSummary(): Promise<PlayerAccountSummaryResponse> {
  const config = getSupabasePublicConfig();
  if (!config) return { ok: false, error: "Account data is not configured.", code: "misconfigured" };

  const user = await getCurrentAuthUser();
  if (!user) return { ok: true, authenticated: false };
  if (user.is_anonymous === true) return { ok: true, authenticated: true, isAnonymous: true };

  const supabase = await createSupabaseServerClient(config);
  const [streakResult, overviewResult] = await Promise.all([
    supabase.rpc("get_player_streak"),
    supabase.rpc("get_player_account_overview"),
  ]);
  if (streakResult.error || overviewResult.error) {
    return { ok: false, error: "Account data is temporarily unavailable.", code: "query_failed" };
  }

  const streakRow = ((streakResult.data ?? []) as PlayerStreakRpcRow[])[0];
  const overviewRow = ((overviewResult.data ?? []) as OverviewRow[])[0];
  const rank = overviewRow?.best_rank === null || overviewRow?.best_rank === undefined
    ? null
    : Number(overviewRow.best_rank);

  return {
    ok: true,
    authenticated: true,
    isAnonymous: false,
    ...(streakRow
      ? mapPlayerStreakRow(streakRow)
      : { currentStreak: 0, longestStreak: 0, todayCompleted: false, lastCompletedStartsAt: null }),
    completionDays: overviewRow?.completion_days ?? [],
    bestRank: rank !== null && Number.isSafeInteger(rank) && rank > 0 ? rank : null,
  };
}
