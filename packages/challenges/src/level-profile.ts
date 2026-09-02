/**
 * Level Profile v1 — curriculum serialization for authoring levels.
 *
 * Ownership split (invariant):
 * - Sim-scored (compiled into ChallengeDefinition later): workload, geo, transfer,
 *   scoring.requirements/budget/unscoredTargets, coachingPolicy, workloadAffinity,
 *   identity fields, sandbox component *types* (as allowedComponentTypes).
 * - Teaching / UI / playtest only (never pass/fail): narrative, component teaching
 *   cards, volumeProfile, starterArchitecture, firstRunExpectation, playtestChecklist,
 *   curriculumTags, forbiddenMechanisms, interviewCurriculum.
 *
 * Volume bands are soft teaching ranges for visuals/playtest — they must not be
 * treated as scored topology or required path shares.
 */

import {
  validateArchitecture,
  type Architecture,
  type ChallengeCoachingPolicy,
  type ChallengeDefinition,
  type GeographicTrafficShare,
  type RequirementDefinition,
  type TransferPayloadAssumptions,
  type UnscoredChallengeTarget,
  type WorkloadAffinity,
  type WorkloadChannel,
  type WorkloadCompletionContract,
  type WorkloadDefinition,
  type WorkloadMechanismId,
} from "@faultline/core";

import { assertChallengeDefinition, ChallengeDefinitionError } from "./validation.js";

const slugPattern = /^[a-z][a-z0-9-]*$/;

const LEVEL_PROFILE_TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "identity",
  "narrative",
  "sandbox",
  "workload",
  "workloadChannels",
  "workloadCompletionContracts",
  "geographicDistribution",
  "transferPayload",
  "scoring",
  "coachingPolicy",
  "workloadAffinity",
  "volumeProfile",
  "starterArchitecture",
  "firstRunExpectation",
  "playtestChecklist",
  "curriculumTags",
  "forbiddenMechanisms",
  "interviewCurriculum",
]);

const FORBIDDEN_TOPOLOGY_SCORING_KEYS = new Set([
  "requiredComponents",
  "mustInclude",
  "canonicalTopology",
  "scoreTopology",
]);

/** Path keys used in volume teaching bands beyond mechanism ids. */
export type VolumePathId = WorkloadMechanismId | "origin_compute" | "origin_store";

const volumePathIds = new Set<string>([
  "edge_cache",
  "data_cache",
  "request_fanout",
  "geo_routing",
  "stateless_compute",
  "durable_store",
  "object_store",
  "async_buffer",
  "async_consumer",
  "origin_compute",
  "origin_store",
]);

export class LevelProfileError extends Error {
  override name = "LevelProfileError";
}

export interface LevelProfileIdentity {
  slug: string;
  /** Challenge version recorded for competition snapshots. */
  version: number;
  title: string;
  /**
   * Public ChallengeDefinition.prompt — problem-only, no prescribed topology.
   * Distinct from narrative.hook (teaching/story UI).
   */
  prompt: string;
  developmentOnly: boolean;
}

export interface LevelNarrative {
  /** One-line hook (e.g. viral moment). */
  hook: string;
  /** Why the fail-first arc matters. */
  stakes: string;
  /** Short bullets for LevelBriefing. */
  briefingBeats: readonly string[];
  /** Teaching boundary (e.g. Queue, Worker) — not a scored ban list. */
  outOfScope: readonly string[];
}

/**
 * Educational card for one placeable catalog type.
 * Plain-language teaching only — not a scored role id.
 */
export interface LevelComponentCard {
  type: string;
  whyHere: string;
  pros: readonly string[];
  cons: readonly string[];
  commonMistakes: readonly string[];
  placementIntent: string;
  costNotes?: string;
}

export interface LevelSandbox {
  components: readonly LevelComponentCard[];
}

export interface LevelScoring {
  requirements: readonly RequirementDefinition[];
  monthlyBudget: number;
  unscoredTargets?: readonly UnscoredChallengeTarget[];
  /** Copy only — hot-key gate remains simulator-owned when hotKeyReadFraction is set. */
  hotKeyGateNote?: string;
}

export interface VolumeShareRange {
  min: number;
  max: number;
}

/**
 * Soft teaching range for visuals/playtest (share of global redirect RPS).
 * Bands may overlap; they must not sum to 1.0 as a hard requirement.
 */
export interface VolumeBand {
  mechanismId: VolumePathId;
  /** Level 1 compatibility field. Multi-workload levels use channel ranges. */
  baselineShareOfRedirects?: VolumeShareRange;
  /** Soft share relative to the named channel; never a scoring input. */
  baselineShareOfChannel?: VolumeShareRange;
  channelId?: string;
  hotKeyShareOfRedirects?: VolumeShareRange;
  hotShareOfChannel?: VolumeShareRange;
  notes?: string;
}

export interface VolumeProfileRules {
  /** Baseline playback must not amplify data_cache above edge_cache when both ACTIVE on-path. */
  baselineCdnOutranksDataCache: boolean;
  /** Hot-key beat may emphasize data_cache using sim hot-key evidence only. */
  hotKeyMayEmphasizeDataCache: boolean;
}

/** Presentation/playtest contract — never pass/fail. */
export interface VolumeProfile {
  bands: readonly VolumeBand[];
  rules: VolumeProfileRules;
}

export interface FirstRunExpectation {
  summary: string;
  expectedFailingRequirementIds: readonly string[];
  hotKeyExpectedFail?: boolean;
}

export type InterviewDifficulty = "intern" | "early_career" | "early_mid";

export interface InterviewEdgeCaseCard {
  id: string;
  setting: string;
  promptCore: string;
  expectedTopics: readonly string[];
  acceptableTradeoffs: readonly string[];
  commonMisconceptions: readonly string[];
  allowedProbeAngles: readonly string[];
  difficulty: InterviewDifficulty;
}

/** Bounded, browser-safe curriculum for the five-question interview. */
export interface LevelInterviewCurriculum {
  starterComponentIds: readonly string[];
  difficultyTags: readonly string[];
  settingFacts: readonly string[];
  edgeCaseCards: readonly InterviewEdgeCaseCard[];
}

/**
 * Level Profile schema v1.
 * Compile to ChallengeDefinition strips teaching-only sections (LP-03).
 */
export interface LevelProfileV1 {
  /** Literal 1 — bump only on breaking profile schema changes. */
  schemaVersion: 1;
  identity: LevelProfileIdentity;
  narrative: LevelNarrative;
  sandbox: LevelSandbox;
  workload: WorkloadDefinition;
  /** Optional named demand streams for multi-workload levels. */
  workloadChannels?: readonly WorkloadChannel[];
  /** Optional channel-specific graph semantics for end-to-end completion. */
  workloadCompletionContracts?: readonly WorkloadCompletionContract[];
  geographicDistribution?: readonly GeographicTrafficShare[];
  transferPayload?: TransferPayloadAssumptions;
  scoring: LevelScoring;
  coachingPolicy?: ChallengeCoachingPolicy;
  /** Omit for legacy mechanism ceilings (1.0). */
  workloadAffinity?: WorkloadAffinity;
  volumeProfile: VolumeProfile;
  starterArchitecture: Architecture;
  firstRunExpectation: FirstRunExpectation;
  playtestChecklist: readonly string[];
  curriculumTags: readonly string[];
  /** Mechanism ids intentionally out of this level's story. */
  forbiddenMechanisms: readonly string[];
  interviewCurriculum: LevelInterviewCurriculum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function assertShareRange(value: unknown, context: string): asserts value is VolumeShareRange {
  if (!isRecord(value) || typeof value.min !== "number" || typeof value.max !== "number") {
    throw new LevelProfileError(`${context} must be an object with numeric min and max.`);
  }
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) {
    throw new LevelProfileError(`${context} min/max must be finite.`);
  }
  if (value.min < 0 || value.max > 1 || value.min > value.max) {
    throw new LevelProfileError(`${context} must satisfy 0 <= min <= max <= 1.`);
  }
}

function assertNonEmptyStringArray(value: unknown, context: string): asserts value is string[] {
  if (!isStringArray(value) || value.length === 0) {
    throw new LevelProfileError(`${context} must be a non-empty string array.`);
  }
}

function assertBoundedStringArray(value: unknown, context: string, maxLength: number): asserts value is string[] {
  assertNonEmptyStringArray(value, context);
  if (value.length > maxLength) {
    throw new LevelProfileError(`${context} must contain at most ${maxLength} entries.`);
  }
  for (const item of value) {
    if (item.length > 240) throw new LevelProfileError(`${context} entries must be at most 240 characters.`);
  }
}

function assertInterviewCurriculum(value: unknown, starterArchitecture: Architecture): asserts value is LevelInterviewCurriculum {
  if (!isRecord(value)) throw new LevelProfileError("interviewCurriculum must be an object.");
  assertBoundedStringArray(value.starterComponentIds, "interviewCurriculum.starterComponentIds", 32);
  const starterIds = new Set(starterArchitecture.components.map((component) => component.id));
  const seenStarterIds = new Set<string>();
  for (const id of value.starterComponentIds) {
    if (!slugPattern.test(id)) throw new LevelProfileError("interviewCurriculum.starterComponentIds must use stable ids.");
    if (!starterIds.has(id)) throw new LevelProfileError(`interviewCurriculum references unknown starter component "${id}".`);
    if (seenStarterIds.has(id)) throw new LevelProfileError(`interviewCurriculum has duplicate starter component "${id}".`);
    seenStarterIds.add(id);
  }
  assertBoundedStringArray(value.difficultyTags, "interviewCurriculum.difficultyTags", 12);
  assertBoundedStringArray(value.settingFacts, "interviewCurriculum.settingFacts", 12);
  if (!Array.isArray(value.edgeCaseCards) || value.edgeCaseCards.length === 0 || value.edgeCaseCards.length > 12) {
    throw new LevelProfileError("interviewCurriculum.edgeCaseCards must contain 1 to 12 cards.");
  }
  const seenCardIds = new Set<string>();
  for (let index = 0; index < value.edgeCaseCards.length; index += 1) {
    const card = value.edgeCaseCards[index];
    const context = `interviewCurriculum.edgeCaseCards[${index}]`;
    if (!isRecord(card)) throw new LevelProfileError(`${context} must be an object.`);
    if (!isNonEmptyString(card.id) || !slugPattern.test(card.id)) throw new LevelProfileError(`${context}.id must be a stable lowercase hyphenated identifier.`);
    if (seenCardIds.has(card.id)) throw new LevelProfileError(`${context}.id must be unique.`);
    seenCardIds.add(card.id);
    for (const field of ["setting", "promptCore"] as const) {
      if (!isNonEmptyString(card[field]) || card[field].length > 240) throw new LevelProfileError(`${context}.${field} must be 1 to 240 characters.`);
    }
    assertBoundedStringArray(card.expectedTopics, `${context}.expectedTopics`, 8);
    assertBoundedStringArray(card.acceptableTradeoffs, `${context}.acceptableTradeoffs`, 6);
    assertBoundedStringArray(card.commonMisconceptions, `${context}.commonMisconceptions`, 6);
    assertBoundedStringArray(card.allowedProbeAngles, `${context}.allowedProbeAngles`, 6);
    if (!(["intern", "early_career", "early_mid"] as const).includes(card.difficulty as InterviewDifficulty)) {
      throw new LevelProfileError(`${context}.difficulty must be intern, early_career, or early_mid.`);
    }
  }
  if (!value.edgeCaseCards.some((card) => (card as InterviewEdgeCaseCard).difficulty === "early_career")) {
    throw new LevelProfileError("interviewCurriculum must include an early_career edge-case card.");
  }
}

function assertComponentCard(value: unknown, index: number): asserts value is LevelComponentCard {
  const context = `sandbox.components[${index}]`;
  if (!isRecord(value)) throw new LevelProfileError(`${context} must be an object.`);
  if (!isNonEmptyString(value.type) || !slugPattern.test(value.type)) {
    throw new LevelProfileError(`${context}.type must be a stable lowercase hyphenated catalog type.`);
  }
  if (!isNonEmptyString(value.whyHere)) throw new LevelProfileError(`${context}.whyHere must be a non-empty string.`);
  if (!isNonEmptyString(value.placementIntent)) {
    throw new LevelProfileError(`${context}.placementIntent must be a non-empty string.`);
  }
  assertNonEmptyStringArray(value.pros, `${context}.pros`);
  assertNonEmptyStringArray(value.cons, `${context}.cons`);
  assertNonEmptyStringArray(value.commonMistakes, `${context}.commonMistakes`);
  if (value.costNotes !== undefined && !isNonEmptyString(value.costNotes)) {
    throw new LevelProfileError(`${context}.costNotes must be a non-empty string when set.`);
  }
}

function assertVolumeProfile(value: unknown): asserts value is VolumeProfile {
  if (!isRecord(value)) throw new LevelProfileError("volumeProfile must be an object.");
  if (!Array.isArray(value.bands) || value.bands.length === 0) {
    throw new LevelProfileError("volumeProfile.bands must be a non-empty array.");
  }
  for (let index = 0; index < value.bands.length; index += 1) {
    const band = value.bands[index];
    const context = `volumeProfile.bands[${index}]`;
    if (!isRecord(band)) throw new LevelProfileError(`${context} must be an object.`);
    if (!isNonEmptyString(band.mechanismId) || !volumePathIds.has(band.mechanismId)) {
      throw new LevelProfileError(`${context}.mechanismId must be a known mechanism or origin path id.`);
    }
    const hasRedirectRange = band.baselineShareOfRedirects !== undefined;
    const hasChannelRange = band.baselineShareOfChannel !== undefined;
    if (!hasRedirectRange && !hasChannelRange) {
      throw new LevelProfileError(`${context} must define baselineShareOfRedirects or baselineShareOfChannel.`);
    }
    if (hasChannelRange && !isNonEmptyString(band.channelId)) {
      throw new LevelProfileError(`${context}.channelId is required with baselineShareOfChannel.`);
    }
    if (hasRedirectRange) assertShareRange(band.baselineShareOfRedirects, `${context}.baselineShareOfRedirects`);
    if (hasChannelRange) assertShareRange(band.baselineShareOfChannel, `${context}.baselineShareOfChannel`);
    if (band.hotKeyShareOfRedirects !== undefined) {
      assertShareRange(band.hotKeyShareOfRedirects, `${context}.hotKeyShareOfRedirects`);
    }
    if (band.hotShareOfChannel !== undefined) {
      if (!isNonEmptyString(band.channelId)) {
        throw new LevelProfileError(`${context}.channelId is required with hotShareOfChannel.`);
      }
      assertShareRange(band.hotShareOfChannel, `${context}.hotShareOfChannel`);
    }
    if (band.notes !== undefined && !isNonEmptyString(band.notes)) {
      throw new LevelProfileError(`${context}.notes must be a non-empty string when set.`);
    }
  }
  if (!isRecord(value.rules)) throw new LevelProfileError("volumeProfile.rules must be an object.");
  if (typeof value.rules.baselineCdnOutranksDataCache !== "boolean") {
    throw new LevelProfileError("volumeProfile.rules.baselineCdnOutranksDataCache must be a boolean.");
  }
  if (typeof value.rules.hotKeyMayEmphasizeDataCache !== "boolean") {
    throw new LevelProfileError("volumeProfile.rules.hotKeyMayEmphasizeDataCache must be a boolean.");
  }
}

/**
 * Builds a ChallengeDefinition-shaped object so existing challenge validators
 * cover workload, geo, transfer, affinity, coaching, and requirements.
 * Teaching-only profile fields are not included.
 */
export function challengeShapedFieldsFromLevelProfile(profile: LevelProfileV1): ChallengeDefinition {
  return {
    slug: profile.identity.slug,
    version: profile.identity.version,
    title: profile.identity.title,
    prompt: profile.identity.prompt,
    developmentOnly: profile.identity.developmentOnly,
    workload: profile.workload,
    ...(profile.workloadChannels ? { workloadChannels: profile.workloadChannels } : {}),
    ...(profile.workloadCompletionContracts ? { workloadCompletionContracts: profile.workloadCompletionContracts } : {}),
    ...(profile.geographicDistribution ? { geographicDistribution: profile.geographicDistribution } : {}),
    ...(profile.transferPayload ? { transferPayload: profile.transferPayload } : {}),
    ...(profile.coachingPolicy ? { coachingPolicy: profile.coachingPolicy } : {}),
    ...(profile.workloadAffinity ? { workloadAffinity: profile.workloadAffinity } : {}),
    ...(profile.scoring.unscoredTargets ? { unscoredTargets: profile.scoring.unscoredTargets } : {}),
    requirements: profile.scoring.requirements,
    monthlyBudget: profile.scoring.monthlyBudget,
    allowedComponentTypes: profile.sandbox.components.map((component) => component.type),
  };
}

/** Validates a Level Profile v1 document before compile or UI consumption. */
export function assertLevelProfile(value: unknown): asserts value is LevelProfileV1 {
  if (!isRecord(value)) throw new LevelProfileError("Level profile must be an object.");

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_TOPOLOGY_SCORING_KEYS.has(key)) {
      throw new LevelProfileError(`Level profile must not include topology-scoring key "${key}".`);
    }
    if (!LEVEL_PROFILE_TOP_LEVEL_KEYS.has(key)) {
      throw new LevelProfileError(`Level profile has unknown top-level key "${key}".`);
    }
  }

  if (value.schemaVersion !== 1) {
    throw new LevelProfileError("Level profile schemaVersion must be 1.");
  }

  if (!isRecord(value.identity)) throw new LevelProfileError("identity must be an object.");
  if (!isNonEmptyString(value.identity.slug) || !slugPattern.test(value.identity.slug)) {
    throw new LevelProfileError("identity.slug must be a stable lowercase hyphenated identifier.");
  }
  if (typeof value.identity.version !== "number" || !Number.isInteger(value.identity.version) || value.identity.version < 1) {
    throw new LevelProfileError("identity.version must be a positive integer.");
  }
  if (!isNonEmptyString(value.identity.title)) throw new LevelProfileError("identity.title must be a non-empty string.");
  if (!isNonEmptyString(value.identity.prompt)) {
    throw new LevelProfileError("identity.prompt must be a non-empty string.");
  }
  if (typeof value.identity.developmentOnly !== "boolean") {
    throw new LevelProfileError("identity.developmentOnly must be a boolean.");
  }

  if (!isRecord(value.narrative)) throw new LevelProfileError("narrative must be an object.");
  if (!isNonEmptyString(value.narrative.hook)) throw new LevelProfileError("narrative.hook must be a non-empty string.");
  if (!isNonEmptyString(value.narrative.stakes)) throw new LevelProfileError("narrative.stakes must be a non-empty string.");
  assertNonEmptyStringArray(value.narrative.briefingBeats, "narrative.briefingBeats");
  assertNonEmptyStringArray(value.narrative.outOfScope, "narrative.outOfScope");

  if (!isRecord(value.sandbox) || !Array.isArray(value.sandbox.components) || value.sandbox.components.length === 0) {
    throw new LevelProfileError("sandbox.components must be a non-empty array.");
  }
  const seenTypes = new Set<string>();
  for (let index = 0; index < value.sandbox.components.length; index += 1) {
    assertComponentCard(value.sandbox.components[index], index);
    const type = (value.sandbox.components[index] as LevelComponentCard).type;
    if (seenTypes.has(type)) {
      throw new LevelProfileError(`sandbox.components has duplicate type "${type}".`);
    }
    seenTypes.add(type);
  }
  if (!seenTypes.has("traffic-source")) {
    throw new LevelProfileError('sandbox.components must include type "traffic-source".');
  }

  if (!isRecord(value.scoring)) throw new LevelProfileError("scoring must be an object.");
  if (!Array.isArray(value.scoring.requirements)) {
    throw new LevelProfileError("scoring.requirements must be an array.");
  }
  if (typeof value.scoring.monthlyBudget !== "number") {
    throw new LevelProfileError("scoring.monthlyBudget must be a number.");
  }
  if (value.scoring.hotKeyGateNote !== undefined && !isNonEmptyString(value.scoring.hotKeyGateNote)) {
    throw new LevelProfileError("scoring.hotKeyGateNote must be a non-empty string when set.");
  }

  // Reuse challenge validators for workload / geo / transfer / affinity / coaching / requirements.
  try {
    assertChallengeDefinition(
      challengeShapedFieldsFromLevelProfile(value as unknown as LevelProfileV1),
    );
  } catch (error) {
    if (error instanceof ChallengeDefinitionError) {
      throw new LevelProfileError(error.message);
    }
    throw error;
  }

  assertVolumeProfile(value.volumeProfile);

  const architectureResult = validateArchitecture(value.starterArchitecture);
  if (!architectureResult.success) {
    const detail = architectureResult.errors.map((issue) => issue.message).join("; ");
    throw new LevelProfileError(`starterArchitecture is invalid: ${detail}`);
  }
  assertInterviewCurriculum(value.interviewCurriculum, value.starterArchitecture as Architecture);

  if (!isRecord(value.firstRunExpectation)) {
    throw new LevelProfileError("firstRunExpectation must be an object.");
  }
  if (!isNonEmptyString(value.firstRunExpectation.summary)) {
    throw new LevelProfileError("firstRunExpectation.summary must be a non-empty string.");
  }
  if (!Array.isArray(value.firstRunExpectation.expectedFailingRequirementIds)) {
    throw new LevelProfileError("firstRunExpectation.expectedFailingRequirementIds must be an array.");
  }
  const requirementIds = new Set(
    (value.scoring.requirements as RequirementDefinition[]).map((requirement) => requirement.id),
  );
  for (const id of value.firstRunExpectation.expectedFailingRequirementIds) {
    if (!isNonEmptyString(id)) {
      throw new LevelProfileError("firstRunExpectation.expectedFailingRequirementIds entries must be non-empty strings.");
    }
    if (!requirementIds.has(id)) {
      throw new LevelProfileError(
        `firstRunExpectation.expectedFailingRequirementIds references unknown requirement "${id}".`,
      );
    }
  }
  if (
    value.firstRunExpectation.hotKeyExpectedFail !== undefined &&
    typeof value.firstRunExpectation.hotKeyExpectedFail !== "boolean"
  ) {
    throw new LevelProfileError("firstRunExpectation.hotKeyExpectedFail must be a boolean when set.");
  }

  assertNonEmptyStringArray(value.playtestChecklist, "playtestChecklist");
  assertNonEmptyStringArray(value.curriculumTags, "curriculumTags");
  if (!Array.isArray(value.forbiddenMechanisms) || !value.forbiddenMechanisms.every((item) => isNonEmptyString(item))) {
    throw new LevelProfileError("forbiddenMechanisms must be an array of non-empty strings.");
  }
}

/** Derive allowed catalog types from sandbox cards (compile-time; avoids drift). */
export function allowedComponentTypesFromLevelProfile(profile: LevelProfileV1): readonly string[] {
  return profile.sandbox.components.map((component) => component.type);
}
