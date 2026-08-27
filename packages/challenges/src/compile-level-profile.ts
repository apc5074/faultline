import type { ChallengeDefinition } from "@faultline/core";

import {
  assertLevelProfile,
  challengeShapedFieldsFromLevelProfile,
} from "./level-profile.js";

/**
 * Compile a Level Profile into the official ChallengeDefinition.
 * Teaching-only fields (narrative cards, volumeProfile, starter, playtest, tags)
 * are omitted — simulator and competition stay ChallengeDefinition-only.
 *
 * `allowedComponentTypes` preserves sandbox.components JSON order.
 */
export function compileChallengeFromLevelProfile(profile: unknown): ChallengeDefinition {
  assertLevelProfile(profile);
  return challengeShapedFieldsFromLevelProfile(profile);
}
