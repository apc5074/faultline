import type { ChallengeDefinition } from "@faultline/core";

import { premiereNightChallenge } from "./premiere-night.js";
import { urlShortenerChallenge } from "./url-shortener.js";

/**
 * Resolve a registered Level Profile slug to the ChallengeDefinition used by
 * the simulator and official competition flow.
 *
 * Keep this registry explicit and browser-safe: profile teaching data remains
 * available through getLevelCurriculum/getLevelProfile, while this resolver
 * only returns scoring/runtime configuration.
 */
const playableChallenges: Readonly<Record<string, ChallengeDefinition>> = {
  "url-shortener": urlShortenerChallenge,
  "premiere-night": premiereNightChallenge,
};

export function resolvePlayableChallenge(slug: string): ChallengeDefinition {
  const challenge = playableChallenges[slug];
  if (!challenge) {
    throw new Error(`Unknown playable challenge slug: ${slug}`);
  }
  return challenge;
}
