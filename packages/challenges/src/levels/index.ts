/**
 * Level profile registry — slug → JSON module path (relative to package src).
 * LP-03 will compile registered profiles into ChallengeDefinition exports.
 */
export const LEVEL_PROFILE_SLUGS = ["url-shortener", "premiere-night"] as const;

export type LevelProfileSlug = (typeof LEVEL_PROFILE_SLUGS)[number];
