import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826169000_limit_challenge_visibility.sql"),
  "utf8",
);

assert.match(migration, /drop policy if exists "Challenge versions are publicly readable"/i);
assert.match(migration, /drop policy if exists "Daily challenges are publicly readable"/i);
assert.match(migration, /create policy "Active daily challenge is publicly readable"/i);
assert.match(migration, /starts_at <= now\(\) and ends_at > now\(\)/i);
assert.match(migration, /create policy "Active challenge version is publicly readable"/i);
assert.match(migration, /exists \([\s\S]*dc\.challenge_version_id = challenge_versions\.id/is);
assert.doesNotMatch(migration, /using \(true\)/i);

const daily = readFileSync(join(root, "lib/challenges/daily.ts"), "utf8");
const historicalLookup = daily.slice(daily.indexOf("export async function getChallengeVersionById"));
assert.match(historicalLookup, /createSupabaseServiceClient\(\)/);
assert.doesNotMatch(historicalLookup, /createSupabaseServerClient/);

console.log("challenge privacy migration verified");
