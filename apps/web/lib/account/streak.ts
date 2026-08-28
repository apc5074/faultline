import "server-only";

import {
  mapPlayerStreakRow,
  type PlayerStreakResponse,
  type PlayerStreakRpcRow,
} from "@/lib/account/streak-types";
import { createSupabaseServerClient, getCurrentAuthUser, getSupabasePublicConfig } from "@/lib/supabase/server";

export class PlayerStreakError extends Error {
  override name = "PlayerStreakError";
  code: "misconfigured" | "query_failed";

  constructor(message: string, code: "misconfigured" | "query_failed") {
    super(message);
    this.code = code;
  }
}

/** Loads recomputed streak state for the current permanent account. */
export async function getPlayerStreak(): Promise<PlayerStreakResponse> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new PlayerStreakError("Supabase is not configured.", "misconfigured");
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return { ok: true, authenticated: false, requiresSignIn: true };
  }

  if (user.is_anonymous === true) {
    return { ok: true, authenticated: true, isAnonymous: true, requiresPermanentAccount: true };
  }

  const supabase = await createSupabaseServerClient(config);
  const result = await supabase.rpc("get_player_streak");

  if (result.error) {
    throw new PlayerStreakError(result.error.message, "query_failed");
  }

  const row = ((result.data ?? []) as PlayerStreakRpcRow[])[0];
  if (!row) {
    return {
      ok: true,
      authenticated: true,
      isAnonymous: false,
      currentStreak: 0,
      longestStreak: 0,
      todayCompleted: false,
      lastCompletedStartsAt: null,
    };
  }

  const snapshot = mapPlayerStreakRow(row);
  return {
    ok: true,
    authenticated: true,
    isAnonymous: false,
    ...snapshot,
  };
}
