/** P10-014 — official scorecard renders server-verified fields and leaves sharing as a safe slot. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scorecard = await readFile(new URL("../features/official-attempt/OfficialScorecard.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../features/architecture-canvas/usePlaygroundWorkspace.ts", import.meta.url), "utf8");
const canvas = await readFile(new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url), "utf8");

assert.match(scorecard, /Server-verified submission/);
assert.match(scorecard, /result\.submissionId/);
assert.match(scorecard, /result\.officialSolveMs/);
assert.match(scorecard, /result\.cost\.monthlyTotal/);
assert.match(scorecard, /Verified requirements/);
assert.match(scorecard, /Share result \(coming soon\)/);
assert.match(scorecard, /Architecture changed after verification/);
assert.match(workspace, /setOfficialVerification\(body\)/);
assert.match(canvas, /<PlayerRankHud \/>/);
assert.match(canvas, /<OfficialScorecard/);
assert.doesNotMatch(scorecard, /load.*canvas/i);

console.log("official scorecard verified");
