import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ALIAS_INSERT_MAX_ATTEMPTS, generateAlias, isValidAliasFormat } from "./alias";

export type ProfileRow = {
  user_id: string;
  alias: string;
  created_at: string;
};

export class ProfileAliasError extends Error {
  override name = "ProfileAliasError";
  constructor(
    message: string,
    readonly code: "unique_exhausted" | "persist_failed" | "invalid_alias",
  ) {
    super(message);
  }
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** Returns existing alias or creates a new unique profile for the authenticated user. */
export async function ensureProfileForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ alias: string; created: boolean }> {
  const existing = await supabase.from("profiles").select("alias").eq("user_id", userId).maybeSingle();
  if (existing.error) {
    throw new ProfileAliasError(existing.error.message, "persist_failed");
  }
  if (existing.data?.alias) {
    return { alias: existing.data.alias, created: false };
  }

  for (let attempt = 0; attempt < ALIAS_INSERT_MAX_ATTEMPTS; attempt += 1) {
    const alias = generateAlias();
    if (!isValidAliasFormat(alias)) {
      throw new ProfileAliasError(`Generated invalid alias format: ${alias}`, "invalid_alias");
    }

    const inserted = await supabase.from("profiles").insert({ user_id: userId, alias }).select("alias").maybeSingle();

    if (!inserted.error && inserted.data?.alias) {
      return { alias: inserted.data.alias, created: true };
    }

    if (isUniqueViolation(inserted.error)) {
      // Either another request created this user_id, or the alias collided.
      const again = await supabase.from("profiles").select("alias").eq("user_id", userId).maybeSingle();
      if (again.data?.alias) {
        return { alias: again.data.alias, created: false };
      }
      continue;
    }

    throw new ProfileAliasError(inserted.error?.message ?? "Failed to persist profile.", "persist_failed");
  }

  throw new ProfileAliasError("Could not allocate a unique alias.", "unique_exhausted");
}

export async function getProfileAlias(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const result = await supabase.from("profiles").select("alias").eq("user_id", userId).maybeSingle();
  if (result.error) {
    throw new ProfileAliasError(result.error.message, "persist_failed");
  }
  return result.data?.alias ?? null;
}
