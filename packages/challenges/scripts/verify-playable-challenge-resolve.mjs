import assert from "node:assert/strict";

import {
  getLevelCurriculum,
  getLevelProfile,
  getLevelStarterArchitecture,
  LEVEL_PROFILE_SLUGS,
  resolvePlayableChallenge,
  tryGetLevelProfile,
} from "../dist/index.js";
import { assertChallengeDefinition } from "../dist/validation.js";

for (const slug of LEVEL_PROFILE_SLUGS) {
  const profile = getLevelProfile(slug);
  const challenge = resolvePlayableChallenge(slug);
  const curriculum = getLevelCurriculum(slug);
  const starter = getLevelStarterArchitecture(slug);

  assert.doesNotThrow(() => assertChallengeDefinition(challenge));
  assert.equal(challenge.slug, profile.identity.slug);
  assert.equal(challenge.version, profile.identity.version);
  assert.equal(curriculum.slug, profile.identity.slug);
  assert.ok(starter && typeof starter === "object");
  assert.equal(tryGetLevelProfile(slug)?.identity.slug, slug);
}

assert.throws(
  () => resolvePlayableChallenge("unknown-playable-challenge"),
  /Unknown playable challenge slug: unknown-playable-challenge/,
);

console.log("playable challenge resolver verified");
