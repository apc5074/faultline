/** P10-014 — official scorecard renders server-verified fields and leaves sharing as a safe slot. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scorecard = await readFile(new URL("../features/official-attempt/OfficialScorecard.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../features/architecture-canvas/usePlaygroundWorkspace.ts", import.meta.url), "utf8");
const canvas = await readFile(new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url), "utf8");

assert.match(scorecard, /Server-verified pass · within budget/);
assert.match(scorecard, /result\.submissionId/);
assert.match(scorecard, /result\.officialSolveMs/);
assert.match(scorecard, /result\.cost\.monthlyTotal/);
assert.match(scorecard, /Verified requirements/);
assert.match(scorecard, /leaderboardRanks/);
assert.match(scorecard, /ShareResultActions/);
assert.match(scorecard, /Architecture changed after verification/);
assert.match(workspace, /setOfficialVerification\(body\)/);
assert.match(canvas, /<OfficialScorecard/);
assert.doesNotMatch(canvas, /PlayerRankHud/);
assert.doesNotMatch(scorecard, /load.*canvas/i);

console.log("official scorecard verified");
