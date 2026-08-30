import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const profiles = readFileSync(join(root, "../../supabase/migrations/20260826168000_lock_down_profiles.sql"), "utf8");
assert.match(profiles, /drop policy if exists "Profiles aliases are publicly readable"/i);
assert.match(profiles, /create policy "Players read own profile"/i);
assert.match(profiles, /for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/is);
assert.doesNotMatch(profiles, /to anon/i);

for (const migrationName of [
  "20260826164000_fastest_leaderboard.sql",
  "20260826165000_cheapest_leaderboard.sql",
]) {
  assert.match(readFileSync(join(root, `../../supabase/migrations/${migrationName}`), "utf8"), /security definer/i);
}

const challenge = readFileSync(join(root, "../../supabase/migrations/20260826169000_limit_challenge_visibility.sql"), "utf8");
assert.match(challenge, /drop policy if exists "Challenge versions are publicly readable"/i);
assert.match(challenge, /drop policy if exists "Daily challenges are publicly readable"/i);
assert.match(challenge, /create policy "Active daily challenge is publicly readable"/i);
assert.match(challenge, /starts_at <= now\(\) and ends_at > now\(\)/i);
assert.match(challenge, /create policy "Active challenge version is publicly readable"/i);
assert.match(challenge, /exists \([\s\S]*dc\.challenge_version_id = challenge_versions\.id/is);
assert.doesNotMatch(challenge, /using \(true\)/i);

const daily = readFileSync(join(root, "lib/challenges/daily.ts"), "utf8");
const historicalLookup = daily.slice(daily.indexOf("export async function getChallengeVersionById"));
assert.match(historicalLookup, /createSupabaseServiceClient\(\)/);
assert.doesNotMatch(historicalLookup, /createSupabaseServerClient/);

console.log("privacy migrations verified");
