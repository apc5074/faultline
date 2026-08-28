import type { ChallengeDefinition } from "@faultline/core";

import { compileChallengeFromLevelProfile } from "./compile-level-profile.js";
import { assertChallengeDefinition } from "./validation.js";
import premiereNightLevelProfile from "./levels/premiere-night.level.json" with { type: "json" };

export const premiereNightChallenge: ChallengeDefinition = compileChallengeFromLevelProfile(premiereNightLevelProfile);

assertChallengeDefinition(premiereNightChallenge);
