import type { ChallengeDefinition } from "@faultline/core";

import { compileChallengeFromLevelProfile } from "./compile-level-profile.js";
import { assertChallengeDefinition } from "./validation.js";
import urlShortenerLevelProfile from "./levels/url-shortener.level.json" with { type: "json" };

/**
 * Level 1 product challenge: Global URL Shortener.
 *
 * Authored as `levels/url-shortener.level.json` (Level Profile). Official
 * scoring still consumes only this ChallengeDefinition.
 *
 * Geographic shares are challenge-owned. Availability remains an unscored
 * target until truthful resilience semantics exist.
 */
export const urlShortenerChallenge: ChallengeDefinition = compileChallengeFromLevelProfile(
  urlShortenerLevelProfile,
);

/** Combined challenge RPS = redirects + writes (30:1). */
export const urlShortenerTotalRps = urlShortenerChallenge.workload.requestsPerSecond;
/** Redirect (read) RPS for the Global URL Shortener. */
export const urlShortenerRedirectRps = Math.round(
  urlShortenerTotalRps * urlShortenerChallenge.workload.readRatio,
);
/** New-link (write) RPS for the Global URL Shortener. */
export const urlShortenerWriteRps = Math.round(
  urlShortenerTotalRps * urlShortenerChallenge.workload.writeRatio,
);

assertChallengeDefinition(urlShortenerChallenge);
