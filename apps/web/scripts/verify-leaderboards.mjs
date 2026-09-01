import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareCheapestLeaderboardRows,
  compareFastestLeaderboardRows,
  formatLeaderboardCost,
  formatSolveTime,
} from "../lib/leaderboards/format.ts";

assert.equal(formatSolveTime(0), "00:00");
assert.equal(formatSolveTime(5 * 60_000 + 31_000), "05:31");
assert.equal(formatSolveTime(66 * 60_000 + 4_000), "1:06:04");
assert.equal(formatLeaderboardCost(73_200), "$73.2k");
assert.equal(formatLeaderboardCost(68_700), "$68.7k");

const fastestRows = [
  { fastestSolveMs: 400_000, costAtFastest: 80_000, userId: "b" },
  { fastestSolveMs: 300_000, costAtFastest: 90_000, userId: "a" },
  { fastestSolveMs: 300_000, costAtFastest: 70_000, userId: "c" },
  { fastestSolveMs: 300_000, costAtFastest: 70_000, userId: "a" },
];
assert.deepEqual(
  [...fastestRows].sort(compareFastestLeaderboardRows).map((row) => `${row.fastestSolveMs}:${row.costAtFastest}:${row.userId}`),
  ["300000:70000:a", "300000:70000:c", "300000:90000:a", "400000:80000:b"],
);

const cheapestRows = [
  { cheapestCost: 80_000, solveTimeAtCheapestMs: 200_000, userId: "b" },
  { cheapestCost: 70_000, solveTimeAtCheapestMs: 400_000, userId: "a" },
  { cheapestCost: 70_000, solveTimeAtCheapestMs: 300_000, userId: "c" },
  { cheapestCost: 70_000, solveTimeAtCheapestMs: 300_000, userId: "a" },
];
assert.deepEqual(
  [...cheapestRows]
    .sort(compareCheapestLeaderboardRows)
    .map((row) => `${row.cheapestCost}:${row.solveTimeAtCheapestMs}:${row.userId}`),
  ["70000:300000:a", "70000:300000:c", "70000:400000:a", "80000:200000:b"],
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = readFileSync(join(root, "features/leaderboards/LeaderboardHud.tsx"), "utf8");
assert.match(ui, /\/api\/leaderboards\/fastest/);
assert.match(ui, /\/api\/leaderboards\/cheapest/);
assert.match(ui, /Fastest/);
assert.match(ui, /Cheapest/);
assert.match(ui, /formatSolveTime/);
assert.match(ui, /const PODIUM_RANKS = \[1, 2, 3\]/);
assert.match(ui, /Math\.max\(3, maxEntries/);
assert.match(ui, /Open — awaiting a verified solve/);
assert.doesNotMatch(ui, /\buserId\b|\buser_id\b|auth\.users/);

for (const [kind, migrationName, functionName, ordering] of [
  ["fastest", "20260826164000_fastest_leaderboard.sql", "list_fastest_leaderboard", "fastest_solve_ms asc"],
  ["cheapest", "20260826165000_cheapest_leaderboard.sql", "list_cheapest_leaderboard", "cheapest_cost asc"],
]) {
  const route = readFileSync(join(root, `app/api/leaderboards/${kind}/route.ts`), "utf8");
  assert.match(route, new RegExp(`get${kind[0].toUpperCase()}${kind.slice(1)}Leaderboard`));
  assert.match(route, /No authentication/);
  assert.doesNotMatch(route, /getCurrentAuthUser/);

  const lib = readFileSync(join(root, `lib/leaderboards/${kind}.ts`), "utf8");
  assert.match(lib, new RegExp(functionName));
  assert.match(lib, /daily_best/);
  assert.doesNotMatch(lib, /userId:|user_id/);

  const migration = readFileSync(join(root, `../../supabase/migrations/${migrationName}`), "utf8");
  assert.match(migration, new RegExp(functionName));
  assert.match(migration, new RegExp(ordering, "i"));
  assert.match(migration, /user_id asc/i);
  assert.match(migration, /grant execute[\s\S]*to anon/i);
  const returnsMatch = migration.match(/returns table \(([\s\S]*?)\)\s*language/);
  assert.ok(returnsMatch, `${kind} migration should declare returns table`);
  assert.doesNotMatch(returnsMatch[1], /user_id/);
  assert.match(returnsMatch[1], /alias/);
}

const dailyBest = readFileSync(join(root, "../../supabase/migrations/20260826162000_daily_best.sql"), "utf8");
assert.match(dailyBest, /fastest\* stay locked/i);
assert.match(dailyBest, /cheapest_cost/);

console.log("leaderboards verified");
