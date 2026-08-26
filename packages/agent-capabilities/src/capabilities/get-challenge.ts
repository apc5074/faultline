import type { ChallengeDefinition } from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** Compact special-scenario facts exposed to the model (never solution hints). */
export interface ChallengeSpecialScenario {
  readonly type: "hot_key";
  readonly share: number;
}

/** Compact challenge problem statement for agent grounding. */
export interface GetChallengeOutput {
  readonly slug: string;
  readonly title: string;
  readonly workload: {
    readonly redirectsPerSecond: number;
    readonly writesPerSecond: number;
  };
  readonly specialScenarios: readonly ChallengeSpecialScenario[];
  readonly budgetMonthly: number;
}

function redirectsPerSecond(challenge: ChallengeDefinition): number {
  return Math.round(challenge.workload.requestsPerSecond * challenge.workload.readRatio);
}

function writesPerSecond(challenge: ChallengeDefinition): number {
  return Math.round(challenge.workload.requestsPerSecond * challenge.workload.writeRatio);
}

function specialScenarios(challenge: ChallengeDefinition): ChallengeSpecialScenario[] {
  const share = challenge.workload.hotKeyReadFraction;
  if (share === undefined || share <= 0) return [];
  return [{ type: "hot_key", share }];
}

/**
 * Summarize the challenge the player is solving.
 * Describes the problem only — never expected architectures or recommended components.
 */
export function buildGetChallengeOutput(challenge: ChallengeDefinition): GetChallengeOutput {
  return {
    slug: challenge.slug,
    title: challenge.title,
    workload: {
      redirectsPerSecond: redirectsPerSecond(challenge),
      writesPerSecond: writesPerSecond(challenge),
    },
    specialScenarios: specialScenarios(challenge),
    budgetMonthly: challenge.monthlyBudget,
  };
}

export const getChallengeCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetChallengeOutput>
> = {
  name: "get_challenge",
  description:
    "Inspect the challenge the player is solving: workload, special scenarios, and monthly budget. Does not reveal solutions.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return capabilityOk(buildGetChallengeOutput(context.challenge));
  },
};
