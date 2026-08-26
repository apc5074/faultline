import type {
  ChallengeDefinition,
  RequirementComparator,
  RequirementDefinition,
  UnscoredChallengeTarget,
} from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** Symbolic operators shown to the model (from RequirementComparator). */
export type RequirementOperatorSymbol = ">=" | "<=" | "<";

export type RequirementActivityState = "active" | "deferred";

/**
 * Compact success criterion for agent grounding.
 * Describes targets only — never pass/fail against the architecture.
 */
export interface CompactRequirement {
  readonly type: string;
  readonly metric?: string;
  readonly operator?: RequirementOperatorSymbol;
  readonly target?: number;
  readonly unit?: string;
  readonly share?: number;
  readonly state: RequirementActivityState;
  readonly reason?: string;
}

export interface GetRequirementsOutput {
  readonly requirements: readonly CompactRequirement[];
}

const comparatorSymbols: Record<RequirementComparator, RequirementOperatorSymbol> = {
  gte: ">=",
  lte: "<=",
  lt: "<",
};

function latencyMetric(requirement: RequirementDefinition): string {
  const label = requirement.label.toLowerCase();
  if (label.includes("redirect")) return "redirect_p95_ms";
  return "p95_ms";
}

function metricFor(requirement: RequirementDefinition): string | undefined {
  if (requirement.type === "latency") return latencyMetric(requirement);
  if (requirement.type === "throughput") return "throughput_ratio";
  return undefined;
}

function fromScoredRequirement(requirement: RequirementDefinition): CompactRequirement {
  const metric = metricFor(requirement);
  return {
    type: requirement.type,
    ...(metric ? { metric } : {}),
    operator: comparatorSymbols[requirement.comparator],
    target: requirement.target,
    state: "active",
  };
}

function fromUnscoredTarget(target: UnscoredChallengeTarget): CompactRequirement {
  return {
    type: target.id,
    target: target.target,
    unit: target.unit,
    state: "deferred",
    reason: target.reason,
  };
}

function hotKeyRequirement(challenge: ChallengeDefinition): CompactRequirement | undefined {
  const share = challenge.workload.hotKeyReadFraction;
  if (share === undefined || share <= 0) return undefined;
  return {
    type: "hot_key",
    share,
    state: "active",
  };
}

/**
 * List what the system must achieve for this challenge.
 * Does not evaluate the architecture or invent challenge-specific constants.
 */
export function buildGetRequirementsOutput(challenge: ChallengeDefinition): GetRequirementsOutput {
  const requirements: CompactRequirement[] = challenge.requirements.map(fromScoredRequirement);

  const hotKey = hotKeyRequirement(challenge);
  if (hotKey) requirements.push(hotKey);

  for (const target of challenge.unscoredTargets ?? []) {
    requirements.push(fromUnscoredTarget(target));
  }

  return { requirements };
}

export const getRequirementsCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetRequirementsOutput>
> = {
  name: "get_requirements",
  description:
    "List challenge success criteria and deferred targets. Returns configured targets only — does not evaluate pass/fail.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return capabilityOk(buildGetRequirementsOutput(context.challenge));
  },
};
