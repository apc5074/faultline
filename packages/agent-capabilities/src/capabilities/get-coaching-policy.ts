import type { AgentCapability } from "../capability.js";
import { buildCoachingPolicy } from "../coaching-policy.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** Coaching personality contract shared by embedded and external agents. */
export interface GetCoachingPolicyOutput {
  readonly policyText: string;
  readonly focusThemes: readonly string[];
  readonly prohibitedRevealCategories: readonly string[];
}

export function buildGetCoachingPolicyOutput(context: AgentContext): GetCoachingPolicyOutput {
  const policy = context.challenge.coachingPolicy;
  return {
    policyText: buildCoachingPolicy(context),
    focusThemes: policy?.focusThemes ?? [],
    prohibitedRevealCategories: policy?.prohibitedRevealCategories ?? [],
  };
}

/**
 * Return Faultline's coaching personality contract for the active challenge.
 * Describes interviewer behavior only — never canonical topology or solution thresholds.
 */
export const getCoachingPolicyCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetCoachingPolicyOutput>
> = {
  name: "get_coaching_policy",
  description:
    "Read Faultline's coaching personality contract: behavioral rules, learning themes, and prohibited reveal categories. Call before coaching the player.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return capabilityOk(buildGetCoachingPolicyOutput(context));
  },
};
