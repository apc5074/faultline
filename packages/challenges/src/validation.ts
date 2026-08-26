import { isValidRegion, type ChallengeDefinition, type RequirementComparator, type RequirementType } from "@faultline/core";

const slugPattern = /^[a-z][a-z0-9-]*$/;
const requirementTypes = new Set<RequirementType>(["throughput", "latency", "headroom", "budget"]);
const comparators = new Set<RequirementComparator>(["gte", "lte", "lt"]);
/** Safe tolerance for geographic fraction sums (100%). */
const GEOGRAPHIC_FRACTION_SUM_TOLERANCE = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export class ChallengeDefinitionError extends Error {
  override name = "ChallengeDefinitionError";
}

/** Validates configured challenge data before it reaches UI or simulation code. */
export function assertChallengeDefinition(definition: unknown): asserts definition is ChallengeDefinition {
  if (!isRecord(definition)) throw new ChallengeDefinitionError("Challenge definition must be an object.");
  if (!isNonEmptyString(definition.slug) || !slugPattern.test(definition.slug)) {
    throw new ChallengeDefinitionError("Challenge slug must be a stable lowercase hyphenated identifier.");
  }
  if (typeof definition.version !== "number" || !Number.isInteger(definition.version) || definition.version < 1) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" version must be a positive integer.`);
  }
  if (!isNonEmptyString(definition.title) || !isNonEmptyString(definition.prompt) || typeof definition.developmentOnly !== "boolean") {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" requires title, prompt, and developmentOnly fields.`);
  }
  if (!isRecord(definition.workload)) throw new ChallengeDefinitionError(`Challenge "${definition.slug}" requires workload configuration.`);
  const { requestsPerSecond, readRatio, writeRatio, hotKeyReadFraction } = definition.workload;
  if (
    !isFinitePositiveNumber(requestsPerSecond) ||
    typeof readRatio !== "number" ||
    typeof writeRatio !== "number" ||
    readRatio < 0 ||
    writeRatio < 0 ||
    Math.abs(readRatio + writeRatio - 1) > GEOGRAPHIC_FRACTION_SUM_TOLERANCE
  ) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" workload ratios must be non-negative and sum to 1.`);
  }
  if (
    hotKeyReadFraction !== undefined &&
    (typeof hotKeyReadFraction !== "number" ||
      !Number.isFinite(hotKeyReadFraction) ||
      hotKeyReadFraction < 0 ||
      hotKeyReadFraction > 1)
  ) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" hotKeyReadFraction must be between 0 and 1 when set.`);
  }
  if (!isFinitePositiveNumber(definition.monthlyBudget)) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" monthlyBudget must be positive.`);
  }
  if (
    !Array.isArray(definition.allowedComponentTypes) ||
    definition.allowedComponentTypes.length === 0 ||
    !definition.allowedComponentTypes.every((type) => isNonEmptyString(type) && slugPattern.test(type))
  ) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" must allow stable component types.`);
  }
  if (new Set(definition.allowedComponentTypes).size !== definition.allowedComponentTypes.length) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" has duplicate allowed component types.`);
  }
  if (!Array.isArray(definition.requirements) || definition.requirements.length === 0) {
    throw new ChallengeDefinitionError(`Challenge "${definition.slug}" requires outcome requirements.`);
  }
  const ids = new Set<string>();
  for (const requirement of definition.requirements) {
    if (
      !isRecord(requirement) ||
      !isNonEmptyString(requirement.id) ||
      !isNonEmptyString(requirement.label) ||
      !isNonEmptyString(requirement.unit) ||
      !requirementTypes.has(requirement.type as RequirementType) ||
      !comparators.has(requirement.comparator as RequirementComparator) ||
      !isFinitePositiveNumber(requirement.target)
    ) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" has an invalid requirement.`);
    }
    if (ids.has(requirement.id)) throw new ChallengeDefinitionError(`Challenge "${definition.slug}" has duplicate requirement IDs.`);
    ids.add(requirement.id);
  }

  if (definition.geographicDistribution !== undefined) {
    if (!Array.isArray(definition.geographicDistribution) || definition.geographicDistribution.length === 0) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" geographicDistribution must be a non-empty array when set.`);
    }
    const seenRegions = new Set<string>();
    let fractionTotal = 0;
    for (const entry of definition.geographicDistribution) {
      if (!isRecord(entry) || !isNonEmptyString(entry.regionId) || !isFiniteUnitInterval(entry.fraction)) {
        throw new ChallengeDefinitionError(`Challenge "${definition.slug}" has an invalid geographicDistribution entry.`);
      }
      if (!isValidRegion(entry.regionId)) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" geographicDistribution references unknown region "${entry.regionId}".`,
        );
      }
      if (seenRegions.has(entry.regionId)) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" geographicDistribution has duplicate region "${entry.regionId}".`,
        );
      }
      seenRegions.add(entry.regionId);
      fractionTotal += entry.fraction;
    }
    if (Math.abs(fractionTotal - 1) > GEOGRAPHIC_FRACTION_SUM_TOLERANCE) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" geographicDistribution fractions must sum to 1.`);
    }
  }

  if (definition.unscoredTargets !== undefined) {
    if (!Array.isArray(definition.unscoredTargets)) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" unscoredTargets must be an array when set.`);
    }
    for (const target of definition.unscoredTargets) {
      if (
        !isRecord(target) ||
        !isNonEmptyString(target.id) ||
        !isNonEmptyString(target.label) ||
        !isNonEmptyString(target.unit) ||
        !isNonEmptyString(target.reason) ||
        typeof target.target !== "number" ||
        !Number.isFinite(target.target)
      ) {
        throw new ChallengeDefinitionError(`Challenge "${definition.slug}" has an invalid unscored target.`);
      }
    }
  }
}
