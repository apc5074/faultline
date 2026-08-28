/**
 * STREAK-001 — streak computation, migration, API, and UI checks.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { computePlayerStreak, mapPlayerStreakRow } from "../lib/account/streak-types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");

const day = (index: number, completed: boolean, hours = 24) => ({
  startsAt: new Date(Date.UTC(2026, 0, index, 0, 0, 0)).toISOString(),
  endsAt: new Date(Date.UTC(2026, 0, index, hours, 0, 0)).toISOString(),
  completed,
});

console.log("empty streak");
assert.deepEqual(computePlayerStreak([], Date.UTC(2026, 0, 3, 12)), {
  currentStreak: 0,
  longestStreak: 0,
  todayCompleted: false,
  lastCompletedStartsAt: null,
});

console.log("single completed active day");
assert.deepEqual(computePlayerStreak([day(3, true)], Date.UTC(2026, 0, 3, 12)), {
  currentStreak: 1,
  longestStreak: 1,
  todayCompleted: true,
  lastCompletedStartsAt: day(3, true).startsAt,
});

console.log("two consecutive completed days, today in progress");
assert.deepEqual(
  computePlayerStreak([day(2, true), day(3, false)], Date.UTC(2026, 0, 3, 12)),
  {
    currentStreak: 1,
    longestStreak: 1,
    todayCompleted: false,
    lastCompletedStartsAt: day(2, true).startsAt,
  },
);

console.log("missed ended day breaks current streak");
assert.deepEqual(
  computePlayerStreak([day(1, true), day(2, false), day(3, true)], Date.UTC(2026, 0, 3, 18)),
  {
    currentStreak: 1,
    longestStreak: 1,
    todayCompleted: true,
    lastCompletedStartsAt: day(3, true).startsAt,
  },
);

console.log("duplicate submissions do not double count — represented as one completed day");
assert.deepEqual(computePlayerStreak([day(1, true), day(2, true)], Date.UTC(2026, 0, 2, 20)), {
  currentStreak: 2,
  longestStreak: 2,
  todayCompleted: true,
  lastCompletedStartsAt: day(2, true).startsAt,
});

console.log("UTC boundary — before challenge starts");
assert.equal(
  computePlayerStreak([day(3, true)], Date.UTC(2026, 0, 2, 23)).currentStreak,
  0,
);

console.log("row mapping");
assert.deepEqual(
  mapPlayerStreakRow({
    current_streak: 4,
    longest_streak: 7,
    today_completed: false,
    last_completed_starts_at: "2026-01-02T00:00:00.000Z",
  }),
  {
    currentStreak: 4,
    longestStreak: 7,
    todayCompleted: false,
    lastCompletedStartsAt: "2026-01-02T00:00:00.000Z",
  },
);

console.log("migration");
const migration = readFileSync(
  join(repo, "supabase/migrations/20260827133000_player_streak.sql"),
  "utf8",
);
assert.match(migration, /get_player_streak/);
assert.match(migration, /daily_best/);
assert.match(migration, /auth\.uid\(\)/);
assert.match(migration, /security definer/i);
assert.doesNotMatch(migration, /architecture_json/);

console.log("routes and UI");
for (const rel of [
  "app/api/account/streak/route.ts",
  "features/account/PlayerStreakHud.tsx",
  "features/account/AccountStreakPanel.tsx",
  "lib/account/streak.ts",
]) {
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
}

const route = readFileSync(join(root, "app/api/account/streak/route.ts"), "utf8");
assert.match(route, /getPlayerStreak/);
assert.doesNotMatch(route, /user_id|userId/);

const hud = readFileSync(join(root, "features/account/PlayerStreakHud.tsx"), "utf8");
assert.match(hud, /unavailable/);
assert.match(hud, /link_account/);
assert.doesNotMatch(hud, /fastestRank|leaderboard rank|Your rank/i);

console.log("verify:player-streak ok");
