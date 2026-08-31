/** P10-013 — leaderboard copy makes verified ranking rules explicit without client authority. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const leaderboard = await readFile(
  new URL("../features/leaderboards/LeaderboardHud.tsx", import.meta.url),
  "utf8",
);
const scorecard = await readFile(
  new URL("../features/official-attempt/OfficialScorecard.tsx", import.meta.url),
  "utf8",
);

assert.match(leaderboard, /Verified solves only · all requirements pass · within budget/);
assert.match(leaderboard, /No verified, within-budget solves yet/);
assert.match(leaderboard, /\/api\/leaderboards\/(fastest|cheapest)/);
assert.match(scorecard, /Server-verified pass · within budget/);
assert.match(scorecard, /leaderboardRanks/);
assert.doesNotMatch(leaderboard, /setRank|client.*rank|userId/);
assert.doesNotMatch(scorecard, /Refresh|\/api\/leaderboards\/me/);

console.log("leaderboard polish verified");
