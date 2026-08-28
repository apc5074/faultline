import {
  isValidRegion,
  type ArchitecturalRoleId,
  type ChallengeDefinition,
  type RequirementComparator,
  type RequirementType,
  type WorkloadMechanismId,
  type WorkloadChannelKind,
} from "@faultline/core";

const slugPattern = /^[a-z][a-z0-9-]*$/;
const requirementTypes = new Set<RequirementType>(["throughput", "latency", "headroom", "budget"]);
const comparators = new Set<RequirementComparator>(["gte", "lte", "lt"]);
const workloadMechanismIds = new Set<WorkloadMechanismId>([
  "edge_cache",
  "data_cache",
  "request_fanout",
  "geo_routing",
  "stateless_compute",
  "durable_store",
  "object_store",
  "async_buffer",
  "async_consumer",
]);
const architecturalRoleIds = new Set<ArchitecturalRoleId>([
  "edge_ingress",
  "path_middleware",
  "compute",
  "read_aside",
  "write_path",
  "geo_route",
  "primary_store",
  "replica_store",
  "object_store",
  "async_buffer",
  "async_consumer",
  "unreachable",
  "misplaced",
]);
/** Safe tolerance for geographic fraction sums (100%). */
const GEOGRAPHIC_FRACTION_SUM_TOLERANCE = 1e-9;
const workloadChannelKinds = new Set<WorkloadChannelKind>(["request", "object_io", "async_work"]);

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

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function assertGeographicDistribution(value: unknown, context: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ChallengeDefinitionError(`${context} must be a non-empty array.`);
  }
  const seenRegions = new Set<string>();
  let fractionTotal = 0;
  for (const entry of value) {
    if (!isRecord(entry) || !isNonEmptyString(entry.regionId) || !isFiniteUnitInterval(entry.fraction)) {
      throw new ChallengeDefinitionError(`${context} has an invalid region entry.`);
    }
    if (!isValidRegion(entry.regionId)) {
      throw new ChallengeDefinitionError(`${context} references unknown region "${entry.regionId}".`);
    }
    if (seenRegions.has(entry.regionId)) {
      throw new ChallengeDefinitionError(`${context} has duplicate region "${entry.regionId}".`);
    }
    seenRegions.add(entry.regionId);
    fractionTotal += entry.fraction;
  }
  if (Math.abs(fractionTotal - 1) > GEOGRAPHIC_FRACTION_SUM_TOLERANCE) {
    throw new ChallengeDefinitionError(`${context} fractions must sum to 1.`);
  }
}

function assertWorkloadChannels(value: unknown, challengeSlug: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" workloadChannels must be a non-empty array.`);
  }
  const ids = new Set<string>();
  for (const channel of value) {
    if (!isRecord(channel) || !isNonEmptyString(channel.id) || !slugPattern.test(channel.id)) {
      throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" has an invalid workload channel id.`);
    }
    if (ids.has(channel.id)) {
      throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" has duplicate workload channel "${channel.id}".`);
    }
    ids.add(channel.id);
    if (!workloadChannelKinds.has(channel.kind as WorkloadChannelKind)) {
      throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" workload channel "${channel.id}" has an invalid kind.`);
    }
    if (!isFinitePositiveNumber(channel.ratePerSecond)) {
      throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" workload channel "${channel.id}" ratePerSecond must be positive.`);
    }
    for (const key of ["bytesPerOperation", "workUnitsPerOperation"] as const) {
      if (channel[key] !== undefined && !isNonNegativeNumber(channel[key])) {
        throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" workload channel "${channel.id}" ${key} must be non-negative.`);
      }
    }
    if (channel.hotShare !== undefined && !isFiniteUnitInterval(channel.hotShare)) {
      throw new ChallengeDefinitionError(`Challenge "${challengeSlug}" workload channel "${channel.id}" hotShare must be between 0 and 1.`);
    }
    if (channel.geographicDistribution !== undefined) {
      assertGeographicDistribution(
        channel.geographicDistribution,
        `Challenge "${challengeSlug}" workload channel "${channel.id}" geographicDistribution`,
      );
    }
  }
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
  if (definition.workloadChannels !== undefined) {
    assertWorkloadChannels(definition.workloadChannels, definition.slug);
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

  if (definition.transferPayload !== undefined) {
    if (!isRecord(definition.transferPayload)) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" transferPayload must be an object when set.`);
    }
    const keys = [
      "redirectResponseBytes",
      "writeRequestBytes",
      "databaseReadBytes",
      "databaseWriteBytes",
      "replicationBytesPerWrite",
    ] as const;
    for (const key of keys) {
      const value = definition.transferPayload[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" transferPayload.${key} must be a non-negative finite number.`,
        );
      }
    }
  }

  if (definition.coachingPolicy !== undefined) {
    const policy = definition.coachingPolicy;
    const validEntries = (value: unknown): value is readonly string[] =>
      Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every((item) => isNonEmptyString(item) && item.length <= 120 && !/\d/.test(item));
    if (!isRecord(policy) || !validEntries(policy.focusThemes) || !validEntries(policy.prohibitedRevealCategories)) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" has an invalid coachingPolicy.`);
    }
  }

  if (definition.workloadAffinity !== undefined) {
    const affinity = definition.workloadAffinity;
    if (!isRecord(affinity)) {
      throw new ChallengeDefinitionError(`Challenge "${definition.slug}" workloadAffinity must be an object when set.`);
    }

    const assertRoleMultiplierMap = (value: unknown, context: string): void => {
      if (!isRecord(value)) {
        throw new ChallengeDefinitionError(`Challenge "${definition.slug}" ${context} must be an object.`);
      }
      for (const [role, multiplier] of Object.entries(value)) {
        if (!architecturalRoleIds.has(role as ArchitecturalRoleId)) {
          throw new ChallengeDefinitionError(`Challenge "${definition.slug}" ${context} references unknown role "${role}".`);
        }
        if (!isFiniteUnitInterval(multiplier)) {
          throw new ChallengeDefinitionError(`Challenge "${definition.slug}" ${context}.${role} must be between 0 and 1.`);
        }
      }
    };

    if (!isRecord(affinity.mechanisms) || Object.keys(affinity.mechanisms).length === 0) {
      throw new ChallengeDefinitionError(
        `Challenge "${definition.slug}" workloadAffinity.mechanisms must be a non-empty object when workloadAffinity is set.`,
      );
    }
    for (const [mechanismId, mechanismAffinity] of Object.entries(affinity.mechanisms)) {
      if (!workloadMechanismIds.has(mechanismId as WorkloadMechanismId)) {
        throw new ChallengeDefinitionError(`Challenge "${definition.slug}" workloadAffinity references unknown mechanism "${mechanismId}".`);
      }
      if (!isRecord(mechanismAffinity) || !isFiniteUnitInterval(mechanismAffinity.maxEffectiveness)) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" workloadAffinity.mechanisms.${mechanismId}.maxEffectiveness must be between 0 and 1.`,
        );
      }
      if (mechanismAffinity.byRole !== undefined) {
        assertRoleMultiplierMap(mechanismAffinity.byRole, `workloadAffinity.mechanisms.${mechanismId}.byRole`);
      }
      if (mechanismAffinity.defaultRoleMultiplier !== undefined && !isFiniteUnitInterval(mechanismAffinity.defaultRoleMultiplier)) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" workloadAffinity.mechanisms.${mechanismId}.defaultRoleMultiplier must be between 0 and 1.`,
        );
      }
      if (mechanismAffinity.reuseConcentration !== undefined && !isFiniteUnitInterval(mechanismAffinity.reuseConcentration)) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" workloadAffinity.mechanisms.${mechanismId}.reuseConcentration must be between 0 and 1.`,
        );
      }
      if (mechanismAffinity.unitCostPressure !== undefined && !isNonNegativeNumber(mechanismAffinity.unitCostPressure)) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" workloadAffinity.mechanisms.${mechanismId}.unitCostPressure must be a non-negative number.`,
        );
      }
      if (
        mechanismAffinity.processingLatencyPenaltyMs !== undefined &&
        !isNonNegativeNumber(mechanismAffinity.processingLatencyPenaltyMs)
      ) {
        throw new ChallengeDefinitionError(
          `Challenge "${definition.slug}" workloadAffinity.mechanisms.${mechanismId}.processingLatencyPenaltyMs must be a non-negative number.`,
        );
      }
      if (mechanismAffinity.note !== undefined && !isNonEmptyString(mechanismAffinity.note)) {
        throw new ChallengeDefinitionError(`Challenge "${definition.slug}" workloadAffinity.mechanisms.${mechanismId}.note must be a non-empty string when set.`);
      }
    }

    if (affinity.roleDefaults !== undefined) {
      assertRoleMultiplierMap(affinity.roleDefaults, "workloadAffinity.roleDefaults");
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
