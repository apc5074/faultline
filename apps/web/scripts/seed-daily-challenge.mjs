/**
 * Controlled Phase 4 publish/seed for the URL Shortener challenge snapshot.
 *
 * Usage (from repo root, with migrations applied):
 *   pnpm --filter @faultline/web seed:daily-challenge
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Inserts challenge_versions if missing (slug+version / config_hash), then ensures a
 * non-overlapping daily_challenges window covering "now" for competition testing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { hashChallengeConfig, urlShortenerChallenge } from "@faultline/challenges";
import { SIMULATOR_VERSION } from "@faultline/simulator";

function loadEnvFile(path) {
  try {
    const source = readFileSync(path, "utf8");
    for (const line of source.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile(resolve(process.cwd(), "../../.env"));
loadEnvFile(resolve(process.cwd(), ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const definition = urlShortenerChallenge;
const configHash = hashChallengeConfig(definition);

const existingVersion = await supabase
  .from("challenge_versions")
  .select("id, slug, version, config_hash, simulator_version")
  .eq("slug", definition.slug)
  .eq("version", definition.version)
  .maybeSingle();

if (existingVersion.error) {
  console.error(existingVersion.error.message);
  process.exit(1);
}

let challengeVersionId = existingVersion.data?.id;

if (existingVersion.data) {
  if (existingVersion.data.config_hash !== configHash) {
    console.error(
      `challenge_versions ${definition.slug}@${definition.version} exists with a different config_hash. Publish a new version number instead of mutating.`,
    );
    process.exit(1);
  }
  if (existingVersion.data.simulator_version !== SIMULATOR_VERSION) {
    console.error(
      `challenge_versions ${definition.slug}@${definition.version} was published for simulator ${existingVersion.data.simulator_version}; runtime is ${SIMULATOR_VERSION}.`,
    );
    process.exit(1);
  }
  console.log(`Reusing challenge_versions ${challengeVersionId}`);
} else {
  const inserted = await supabase
    .from("challenge_versions")
    .insert({
      slug: definition.slug,
      version: definition.version,
      config_json: definition,
      config_hash: configHash,
      simulator_version: SIMULATOR_VERSION,
    })
    .select("id")
    .single();

  if (inserted.error) {
    console.error(inserted.error.message);
    process.exit(1);
  }
  challengeVersionId = inserted.data.id;
  console.log(`Inserted challenge_versions ${challengeVersionId}`);
  console.log(`config_hash=${configHash}`);
  console.log(`simulator_version=${SIMULATOR_VERSION}`);
}

const now = new Date();
const active = await supabase
  .from("daily_challenges")
  .select("id, starts_at, ends_at, challenge_version_id")
  .lte("starts_at", now.toISOString())
  .gt("ends_at", now.toISOString())
  .maybeSingle();

if (active.error) {
  console.error(active.error.message);
  process.exit(1);
}

if (active.data) {
  if (active.data.challenge_version_id !== challengeVersionId) {
    console.error(
      `An active daily_challenges row (${active.data.id}) already points at a different challenge_version. End that window before seeding another.`,
    );
    process.exit(1);
  }
  console.log(`Active daily_challenges already covers now: ${active.data.id}`);
} else {
  // Phase 4 testing window: start of current UTC day → +365 days.
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endsAt = new Date(startsAt);
  endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 1);

  const insertedDaily = await supabase
    .from("daily_challenges")
    .insert({
      challenge_version_id: challengeVersionId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .select("id, starts_at, ends_at")
    .single();

  if (insertedDaily.error) {
    console.error(insertedDaily.error.message);
    process.exit(1);
  }
  console.log(`Inserted daily_challenges ${insertedDaily.data.id}`);
  console.log(`window ${insertedDaily.data.starts_at} → ${insertedDaily.data.ends_at}`);
}

const again = hashChallengeConfig(definition);
if (again !== configHash) {
  console.error("hashChallengeConfig is unstable");
  process.exit(1);
}

console.log("daily challenge seed complete");
