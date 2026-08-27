import "server-only";

import { assertChallengeDefinition } from "@faultline/challenges";
import type { ChallengeDefinition } from "@faultline/core";
import { SIMULATOR_VERSION } from "@faultline/simulator";

import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type ChallengeVersionRecord = {
  id: string;
  slug: string;
  version: number;
  configHash: string;
  simulatorVersion: string;
  createdAt: string;
  config: ChallengeDefinition;
};

export type ActiveDailyChallenge = {
  dailyChallengeId: string;
  startsAt: string;
  endsAt: string;
  challengeVersion: ChallengeVersionRecord;
};

export class ActiveDailyChallengeError extends Error {
  override name = "ActiveDailyChallengeError";
  constructor(
    message: string,
    readonly code: "misconfigured" | "not_found" | "invalid_config" | "simulator_mismatch",
  ) {
    super(message);
  }
}

type ChallengeVersionRow = {
  id: string;
  slug: string;
  version: number;
  config_json: unknown;
  config_hash: string;
  simulator_version: string;
  created_at: string;
};

type DailyChallengeRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  challenge_versions: ChallengeVersionRow | ChallengeVersionRow[] | null;
};

function asChallengeVersion(row: ChallengeVersionRow): ChallengeVersionRecord {
  try {
    assertChallengeDefinition(row.config_json);
  } catch (error) {
    throw new ActiveDailyChallengeError(
      error instanceof Error ? error.message : "Stored challenge config failed validation.",
      "invalid_config",
    );
  }

  if (row.simulator_version !== SIMULATOR_VERSION) {
    throw new ActiveDailyChallengeError(
      `Active challenge requires simulator ${row.simulator_version}; runtime is ${SIMULATOR_VERSION}.`,
      "simulator_mismatch",
    );
  }

  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    configHash: row.config_hash,
    simulatorVersion: row.simulator_version,
    createdAt: row.created_at,
    config: row.config_json,
  };
}

/**
 * Loads the official challenge active at `now` (server clock).
 * Browser must not supply competition config — only the server returns it.
 */
export async function getActiveDailyChallenge(now: Date = new Date()): Promise<ActiveDailyChallenge> {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new ActiveDailyChallengeError("Supabase is not configured.", "misconfigured");
  }

  const supabase = await createSupabaseServerClient(config);
  const iso = now.toISOString();

  const { data, error } = await supabase
    .from("daily_challenges")
    .select(
      "id, starts_at, ends_at, challenge_versions ( id, slug, version, config_json, config_hash, simulator_version, created_at )",
    )
    .lte("starts_at", iso)
    .gt("ends_at", iso)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ActiveDailyChallengeError(error.message, "not_found");
  }
  if (!data) {
    throw new ActiveDailyChallengeError("No daily challenge is active.", "not_found");
  }

  const row = data as DailyChallengeRow;
  const versionRow = Array.isArray(row.challenge_versions)
    ? row.challenge_versions[0]
    : row.challenge_versions;
  if (!versionRow) {
    throw new ActiveDailyChallengeError("Active daily challenge is missing a challenge version.", "not_found");
  }

  return {
    dailyChallengeId: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    challengeVersion: asChallengeVersion(versionRow),
  };
}

/**
 * Loads an immutable challenge version by id (trusted DB row only).
 * Used by official submission verification — never accept client challenge JSON.
 */
export async function getChallengeVersionById(challengeVersionId: string): Promise<ChallengeVersionRecord> {
  let supabase;
  try {
    // Historical versions are needed only by trusted server-side submission
    // verification. They are intentionally not exposed through public RLS.
    supabase = createSupabaseServiceClient();
  } catch {
    throw new ActiveDailyChallengeError("Supabase is not configured.", "misconfigured");
  }
  const { data, error } = await supabase
    .from("challenge_versions")
    .select("id, slug, version, config_json, config_hash, simulator_version, created_at")
    .eq("id", challengeVersionId)
    .maybeSingle();

  if (error) {
    throw new ActiveDailyChallengeError(error.message, "not_found");
  }
  if (!data) {
    throw new ActiveDailyChallengeError("Challenge version not found.", "not_found");
  }

  return asChallengeVersion(data as ChallengeVersionRow);
}
