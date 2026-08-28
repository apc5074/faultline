import "server-only";

import { createSupabaseServerClient, getCurrentAuthUser, getSupabasePublicConfig } from "@/lib/supabase/server";

export type PlayerAccountOverviewResponse =
  | { ok: true; authenticated: false }
  | { ok: true; authenticated: true; isAnonymous: true }
  | { ok: true; authenticated: true; isAnonymous: false; completionDays: string[]; bestRank: number | null }
  | { ok: false; error: string };

type OverviewRow = { completion_days: string[] | null; best_rank: number | string | null };

/** Server-derived completion days and best rank for the current permanent player. */
export async function getPlayerAccountOverview(): Promise<PlayerAccountOverviewResponse> {
  const config = getSupabasePublicConfig();
  if (!config) return { ok: false, error: "Account data is not configured." };

  const user = await getCurrentAuthUser();
  if (!user) return { ok: true, authenticated: false };
  if (user.is_anonymous === true) return { ok: true, authenticated: true, isAnonymous: true };

  const supabase = await createSupabaseServerClient(config);
  const result = await supabase.rpc("get_player_account_overview");
  if (result.error) return { ok: false, error: "Account data is temporarily unavailable." };

  const row = ((result.data ?? []) as OverviewRow[])[0];
  const rank = row?.best_rank === null || row?.best_rank === undefined ? null : Number(row.best_rank);
  const bestRank = rank !== null && Number.isSafeInteger(rank) && rank > 0 ? rank : null;
  return {
    ok: true,
    authenticated: true,
    isAnonymous: false,
    completionDays: row?.completion_days ?? [],
    bestRank,
  };
}
