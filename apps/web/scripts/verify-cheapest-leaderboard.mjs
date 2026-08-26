import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compareCheapestLeaderboardRows } from "../lib/leaderboards/format.ts";

const rows = [
  { cheapestCost: 80_000, solveTimeAtCheapestMs: 200_000, userId: "b" },
  { cheapestCost: 70_000, solveTimeAtCheapestMs: 400_000, userId: "a" },
  { cheapestCost: 70_000, solveTimeAtCheapestMs: 300_000, userId: "c" },
  { cheapestCost: 70_000, solveTimeAtCheapestMs: 300_000, userId: "a" },
];
const ordered = [...rows].sort(compareCheapestLeaderboardRows);
assert.deepEqual(
  ordered.map((row) => `${row.cheapestCost}:${row.solveTimeAtCheapestMs}:${row.userId}`),
  ["70000:300000:a", "70000:300000:c", "70000:400000:a", "80000:200000:b"],
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(join(root, "app/api/leaderboards/cheapest/route.ts"), "utf8");
assert.match(route, /getCheapestLeaderboard/);
assert.match(route, /No authentication/);
assert.doesNotMatch(route, /getCurrentAuthUser/);

const lib = readFileSync(join(root, "lib/leaderboards/cheapest.ts"), "utf8");
assert.match(lib, /list_cheapest_leaderboard/);
assert.match(lib, /daily_best/);
assert.match(lib, /cheapest_\*/);
assert.doesNotMatch(lib, /userId:/);
assert.doesNotMatch(lib, /user_id/);

const fastestLib = readFileSync(join(root, "lib/leaderboards/fastest.ts"), "utf8");
assert.match(fastestLib, /list_fastest_leaderboard/);
assert.notEqual(
  lib.includes("list_cheapest_leaderboard"),
  fastestLib.includes("list_cheapest_leaderboard"),
);

const ui = readFileSync(join(root, "features/leaderboards/LeaderboardHud.tsx"), "utf8");
assert.match(ui, /\/api\/leaderboards\/cheapest/);
assert.match(ui, /setMode\("cheapest"\)|LeaderboardMode/);
assert.doesNotMatch(ui, /\buserId\b|\buser_id\b/);

const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826165000_cheapest_leaderboard.sql"),
  "utf8",
);
assert.match(migration, /list_cheapest_leaderboard/);
assert.match(migration, /cheapest_cost asc/i);
assert.match(migration, /solve_time_at_cheapest asc/i);
assert.match(migration, /user_id asc/i);
assert.match(migration, /grant execute[\s\S]*to anon/i);
const returnsMatch = migration.match(/returns table \(([\s\S]*?)\)\s*language/);
assert.ok(returnsMatch, "expected returns table clause");
assert.doesNotMatch(returnsMatch[1], /user_id/);
assert.match(returnsMatch[1], /alias/);
assert.match(returnsMatch[1], /cheapest_cost/);
assert.match(returnsMatch[1], /solve_time_at_cheapest/);

const dailyBest = readFileSync(
  join(root, "../../supabase/migrations/20260826162000_daily_best.sql"),
  "utf8",
);
assert.match(dailyBest, /fastest\* stay locked/i);
assert.match(dailyBest, /cheapest_cost/);

console.log("cheapest leaderboard verified");
