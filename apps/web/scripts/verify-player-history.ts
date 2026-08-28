/**
 * PROFILE-001 — player history query, pagination, privacy, and UI checks.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mapPlayerHistoryRow } from "../lib/account/history-types.ts";
import {
  normalizeHistoryPagination,
  PLAYER_HISTORY_MAX_LIMIT,
} from "../lib/account/history-types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");

console.log("pagination bounds");
assert.deepEqual(normalizeHistoryPagination(null, null), { limit: 20, offset: 0 });
assert.deepEqual(normalizeHistoryPagination("999", "-3"), { limit: 50, offset: 0 });
assert.deepEqual(normalizeHistoryPagination("0", "5"), { limit: 1, offset: 5 });
assert.equal(PLAYER_HISTORY_MAX_LIMIT, 50);

console.log("row mapping");
const mapped = mapPlayerHistoryRow({
  challenge_starts_at: "2026-08-27T00:00:00.000Z",
  challenge_slug: "url-shortener",
  challenge_version: 2,
  challenge_title: "Global URL Shortener",
  verified: true,
  solve_ms: 123456,
  monthly_cost_usd: "42000",
  requirements_passed: 4,
  requirements_total: 5,
  submitted_at: "2026-08-27T12:00:00.000Z",
});
assert.equal(mapped.challengeSlug, "url-shortener");
assert.equal(mapped.monthlyCostUsd, 42000);
assert.equal(mapped.verified, true);
assert.equal(mapped.solveMs, 123456);

console.log("migration");
const migration = readFileSync(
  join(repo, "supabase/migrations/20260827130000_player_history.sql"),
  "utf8",
);
assert.match(migration, /list_player_history/);
assert.match(migration, /count_player_history/);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /security definer/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);
assert.doesNotMatch(migration, /architecture_json/);

console.log("routes and UI");
for (const rel of [
  "app/api/account/history/route.ts",
  "app/account/page.tsx",
  "features/account/AccountHistoryPanel.tsx",
  "lib/account/history.ts",
]) {
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
}

const route = readFileSync(join(root, "app/api/account/history/route.ts"), "utf8");
assert.match(route, /getPlayerHistory/);
assert.doesNotMatch(route, /user_id|userId/);

const panel = readFileSync(join(root, "features/account/AccountHistoryPanel.tsx"), "utf8");
assert.match(panel, /requiresPermanentAccount|link_account/);
assert.match(panel, /no verified official submissions/i);
assert.match(panel, /Incomplete/);
assert.doesNotMatch(panel, /architecture_json|submissionId/);

console.log("verify:player-history ok");
