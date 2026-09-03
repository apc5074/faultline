import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getLevelCurriculum, getLevelStarterArchitecture, resolvePlayableChallenge } from "@faultline/challenges";

const source = await readFile(new URL("../features/architecture-canvas/playground-challenge.tsx", import.meta.url), "utf8");
assert.match(source, /fetch\("\/api\/challenges\/active"/);
assert.match(source, /assertChallengeDefinition\(payload\.challenge\.config\)/);
assert.doesNotMatch(source, /activeChallenge\s*=\s*urlShortenerChallenge/);

for (const slug of ["url-shortener", "premiere-night"]) {
  const challenge = resolvePlayableChallenge(slug);
  assert.equal(getLevelCurriculum(slug).slug, challenge.slug);
  assert.equal(getLevelStarterArchitecture(slug).version, 1);
}

console.log("playground challenge provider verified");
