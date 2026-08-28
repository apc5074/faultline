import type { Architecture } from "@faultline/core";

import {
  assertLevelProfile,
  type LevelComponentCard,
  type LevelProfileV1,
} from "./level-profile.js";
import urlShortenerLevelProfile from "./levels/url-shortener.level.json" with { type: "json" };
import premiereNightLevelProfile from "./levels/premiere-night.level.json" with { type: "json" };

const profilesBySlug: Readonly<Record<string, unknown>> = {
  "url-shortener": urlShortenerLevelProfile,
  "premiere-night": premiereNightLevelProfile,
};

/**
 * Browser/server-safe profile load via static JSON imports (no `fs`).
 * Prefer this from apps/web. Use `loadLevelProfile` only in Node scaffold/verify scripts.
 */
export function getLevelProfile(slug: string): LevelProfileV1 {
  const raw = profilesBySlug[slug];
  if (!raw) {
    throw new Error(`Unknown level profile slug: ${slug}`);
  }
  assertLevelProfile(raw);
  return raw;
}

/** Returns undefined when the slug has no Level Profile (e.g. Tiny API). */
export function tryGetLevelProfile(slug: string): LevelProfileV1 | undefined {
  if (!(slug in profilesBySlug)) return undefined;
  return getLevelProfile(slug);
}

/** Deep-clone starter so playground mutations never touch module/profile state. */
export function starterArchitectureFromProfile(profile: LevelProfileV1): Architecture {
  return structuredClone(profile.starterArchitecture);
}

export function getLevelStarterArchitecture(slug: string): Architecture {
  return starterArchitectureFromProfile(getLevelProfile(slug));
}

/** Teaching slice for UI — never pass/fail. */
export interface LevelCurriculumSlice {
  slug: string;
  hook: string;
  stakes: string;
  briefingBeats: readonly string[];
  firstRunSummary: string;
  expectedFailingRequirementIds: readonly string[];
  hotKeyExpectedFail: boolean;
  /** Soft visual teaching bands (LP-05). */
  volumeProfile: LevelProfileV1["volumeProfile"];
  /** Sandbox teaching cards keyed by catalog type. */
  componentCards: Readonly<Record<string, LevelComponentCard>>;
}

export function getLevelCurriculum(slug: string): LevelCurriculumSlice {
  const profile = getLevelProfile(slug);
  const componentCards: Record<string, LevelComponentCard> = {};
  for (const card of profile.sandbox.components) {
    componentCards[card.type] = card;
  }
  return {
    slug: profile.identity.slug,
    hook: profile.narrative.hook,
    stakes: profile.narrative.stakes,
    briefingBeats: profile.narrative.briefingBeats,
    firstRunSummary: profile.firstRunExpectation.summary,
    expectedFailingRequirementIds: profile.firstRunExpectation.expectedFailingRequirementIds,
    hotKeyExpectedFail: profile.firstRunExpectation.hotKeyExpectedFail === true,
    volumeProfile: profile.volumeProfile,
    componentCards,
  };
}

export function getLevelComponentCard(slug: string, componentType: string): LevelComponentCard | undefined {
  const profile = tryGetLevelProfile(slug);
  if (!profile) return undefined;
  return profile.sandbox.components.find((card) => card.type === componentType);
}

/** Compact agent teaching — placement intents only, no pros/cons walls. */
export interface CompactLevelTeachingForAgent {
  narrative: { hook: string; stakes: string };
  teaching: {
    componentTypes: readonly { type: string; placementIntent: string }[];
  };
}

export function compactLevelTeachingForAgent(slug: string): CompactLevelTeachingForAgent | undefined {
  const profile = tryGetLevelProfile(slug);
  if (!profile) return undefined;
  return {
    narrative: {
      hook: profile.narrative.hook,
      stakes: profile.narrative.stakes,
    },
    teaching: {
      componentTypes: profile.sandbox.components.map((card) => ({
        type: card.type,
        placementIntent: card.placementIntent,
      })),
    },
  };
}

/** Fresh clone of Level 1 inherited MVP starter. */
export function urlShortenerStarterArchitecture(): Architecture {
  return getLevelStarterArchitecture("url-shortener");
}
