/** P10-013 — leaderboard copy makes verified ranking rules explicit without client authority. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leaderboard = await readFile(
  new URL("../features/leaderboards/LeaderboardHud.tsx", import.meta.url),
  "utf8",
);
const rank = await readFile(
  new URL("../features/leaderboards/PlayerRankHud.tsx", import.meta.url),
  "utf8",
);

assert.match(leaderboard, /Verified solves only · all requirements pass · within budget/);
assert.match(leaderboard, /No verified, within-budget solves yet/);
assert.match(leaderboard, /\/api\/leaderboards\/(fastest|cheapest)/);
assert.match(rank, /Server-verified pass · within budget/);
assert.match(rank, /status: "unranked"/);
assert.match(rank, /Unranked until a verified within-budget solve/);
assert.doesNotMatch(leaderboard, /setRank|client.*rank|userId/);
assert.doesNotMatch(rank, /fastestRank:\s*0|cheapestRank:\s*0/);

console.log("leaderboard polish verified");
