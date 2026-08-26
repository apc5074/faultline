import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const route = readFileSync(join(root, "app/api/leaderboards/me/route.ts"), "utf8");
assert.match(route, /getMyLeaderboardRanks/);

const lib = readFileSync(join(root, "lib/leaderboards/me.ts"), "utf8");
assert.match(lib, /get_my_leaderboard_ranks/);
assert.match(lib, /getCurrentAuthUser/);
assert.match(lib, /fastestRank/);
assert.match(lib, /cheapestRank/);
assert.match(lib, /ranked: false/);
assert.doesNotMatch(lib, /userId:/);

const ui = readFileSync(join(root, "features/leaderboards/PlayerRankHud.tsx"), "utf8");
assert.match(ui, /\/api\/leaderboards\/me/);
assert.match(ui, /Unranked/);
assert.match(ui, /Fastest/);
assert.match(ui, /Cheapest/);
assert.doesNotMatch(ui, /\buserId\b|\buser_id\b/);
assert.match(ui, /status: "unranked"/);
assert.doesNotMatch(ui, /fastestRank:\s*0|cheapestRank:\s*0/);

const canvas = [
  readFileSync(join(root, "features/architecture-canvas/ArchitectureCanvas.tsx"), "utf8"),
  readFileSync(join(root, "features/architecture-canvas/usePlaygroundWorkspace.ts"), "utf8"),
].join("\n");
assert.match(canvas, /bumpRankRefresh/);
assert.match(readFileSync(join(root, "features/architecture-canvas/ArchitectureCanvas.tsx"), "utf8"), /PlayerRankHud/);

const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826166000_my_leaderboard_ranks.sql"),
  "utf8",
);
assert.match(migration, /get_my_leaderboard_ranks/);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /fastest_solve_ms asc/i);
assert.match(migration, /cheapest_cost asc/i);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);
const returnsMatch = migration.match(/returns table \(([\s\S]*?)\)\s*language/);
assert.ok(returnsMatch);
assert.doesNotMatch(returnsMatch[1], /user_id/);

console.log("current player rank verified");
