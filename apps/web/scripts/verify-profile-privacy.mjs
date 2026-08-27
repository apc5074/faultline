import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826168000_lock_down_profiles.sql"),
  "utf8",
);

assert.match(migration, /drop policy if exists "Profiles aliases are publicly readable"/i);
assert.match(migration, /create policy "Players read own profile"/i);
assert.match(migration, /for select\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)/is);
assert.doesNotMatch(migration, /to anon/i);

const fastest = readFileSync(
  join(root, "../../supabase/migrations/20260826164000_fastest_leaderboard.sql"),
  "utf8",
);
const cheapest = readFileSync(
  join(root, "../../supabase/migrations/20260826165000_cheapest_leaderboard.sql"),
  "utf8",
);
assert.match(fastest, /security definer/i);
assert.match(cheapest, /security definer/i);

console.log("profile privacy migration verified");
