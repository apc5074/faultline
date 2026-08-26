import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareFastestLeaderboardRows,
  formatLeaderboardCost,
  formatSolveTime,
} from "../lib/leaderboards/format.ts";

assert.equal(formatSolveTime(0), "00:00");
assert.equal(formatSolveTime(5 * 60_000 + 31_000), "05:31");
assert.equal(formatSolveTime(66 * 60_000 + 4_000), "1:06:04");
assert.equal(formatLeaderboardCost(73_200), "$73.2k");
assert.equal(formatLeaderboardCost(68_700), "$68.7k");

const rows = [
  { fastestSolveMs: 400_000, costAtFastest: 80_000, userId: "b" },
  { fastestSolveMs: 300_000, costAtFastest: 90_000, userId: "a" },
  { fastestSolveMs: 300_000, costAtFastest: 70_000, userId: "c" },
  { fastestSolveMs: 300_000, costAtFastest: 70_000, userId: "a" },
];
const ordered = [...rows].sort(compareFastestLeaderboardRows);
assert.deepEqual(
  ordered.map((row) => `${row.fastestSolveMs}:${row.costAtFastest}:${row.userId}`),
  ["300000:70000:a", "300000:70000:c", "300000:90000:a", "400000:80000:b"],
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(join(root, "app/api/leaderboards/fastest/route.ts"), "utf8");
assert.match(route, /getFastestLeaderboard/);
assert.match(route, /No authentication/);
assert.doesNotMatch(route, /getCurrentAuthUser/);

const lib = readFileSync(join(root, "lib/leaderboards/fastest.ts"), "utf8");
assert.match(lib, /list_fastest_leaderboard/);
assert.match(lib, /daily_best/);
assert.doesNotMatch(lib, /userId:/);
assert.doesNotMatch(lib, /user_id/);

const ui = readFileSync(join(root, "features/leaderboards/LeaderboardHud.tsx"), "utf8");
assert.match(ui, /\/api\/leaderboards\/fastest/);
assert.match(ui, /\/api\/leaderboards\/cheapest/);
assert.match(ui, /Fastest/);
assert.match(ui, /Cheapest/);
assert.match(ui, /formatSolveTime/);
assert.doesNotMatch(ui, /\buserId\b|\buser_id\b/);
assert.doesNotMatch(ui, /auth\.users/);

const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826164000_fastest_leaderboard.sql"),
  "utf8",
);
assert.match(migration, /list_fastest_leaderboard/);
assert.match(migration, /fastest_solve_ms asc/i);
assert.match(migration, /cost_at_fastest asc/i);
assert.match(migration, /user_id asc/i);
assert.match(migration, /grant execute[\s\S]*to anon/i);
const returnsMatch = migration.match(/returns table \(([\s\S]*?)\)\s*language/);
assert.ok(returnsMatch, "expected returns table clause");
assert.doesNotMatch(returnsMatch[1], /user_id/);
assert.match(returnsMatch[1], /alias/);
assert.match(returnsMatch[1], /fastest_solve_ms/);
assert.match(returnsMatch[1], /cost_at_fastest/);

console.log("fastest leaderboard verified");
