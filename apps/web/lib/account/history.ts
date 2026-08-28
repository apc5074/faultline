import "server-only";

import {
  mapPlayerHistoryRow,
  normalizeHistoryPagination,
  type PlayerHistoryEntry,
  type PlayerHistoryResponse,
  type PlayerHistoryRpcRow,
} from "@/lib/account/history-types";
import { getProfileAlias, ProfileAliasError } from "@/lib/auth/profile";
import { createSupabaseServerClient, getCurrentAuthUser, getSupabasePublicConfig } from "@/lib/supabase/server";

export class PlayerHistoryError extends Error {
  override name = "PlayerHistoryError";
  code: "misconfigured" | "query_failed";

  constructor(message: string, code: "misconfigured" | "query_failed") {
    super(message);
    this.code = code;
  }
}

/**
 * Loads server-verified history for the current permanent account.
 * Guests and anonymous players receive sign-in CTAs without leaking other rows.
 */
export async function getPlayerHistory(searchParams: URLSearchParams): Promise<PlayerHistoryResponse> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new PlayerHistoryError("Supabase is not configured.", "misconfigured");
  }

  const user = await getCurrentAuthUser();
  if (!user) {
    return { ok: true, authenticated: false, requiresSignIn: true };
  }

  if (user.is_anonymous === true) {
    return { ok: true, authenticated: true, isAnonymous: true, requiresPermanentAccount: true };
  }

  const { limit, offset } = normalizeHistoryPagination(
    searchParams.get("limit"),
    searchParams.get("offset"),
  );

  const supabase = await createSupabaseServerClient(config);

  let alias: string | null = null;
  try {
    alias = await getProfileAlias(supabase, user.id);
  } catch (error) {
    if (!(error instanceof ProfileAliasError)) throw error;
  }

  const [rowsResult, countResult] = await Promise.all([
    supabase.rpc("list_player_history", { p_limit: limit, p_offset: offset }),
    supabase.rpc("count_player_history"),
  ]);

  if (rowsResult.error) {
    throw new PlayerHistoryError(rowsResult.error.message, "query_failed");
  }
  if (countResult.error) {
    throw new PlayerHistoryError(countResult.error.message, "query_failed");
  }

  const totalDays = Number(countResult.data ?? 0);
  const entries: PlayerHistoryEntry[] = ((rowsResult.data ?? []) as PlayerHistoryRpcRow[]).map(
    mapPlayerHistoryRow,
  );

  return {
    ok: true,
    authenticated: true,
    isAnonymous: false,
    alias,
    entries,
    limit,
    offset,
    totalDays: Number.isFinite(totalDays) ? totalDays : entries.length,
    hasMore: offset + entries.length < totalDays,
  };
}
