import type { AgentCapability } from "../capability.js";
import { buildCoachingPolicy, REVIEWER_CONTRACT, type CoachingReviewerContract } from "../coaching-policy.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** Coaching personality contract shared by embedded and external agents. */
export interface GetCoachingPolicyOutput {
  readonly policyVersion: "wmp-1";
  readonly policyDigest: string;
  readonly summary: string;
  readonly policyText: string;
  readonly focusThemes: readonly string[];
  readonly prohibitedRevealCategories: readonly string[];
  /** Structured, adapter-neutral reviewer protocol for external and embedded agents. */
  readonly agentRole: CoachingReviewerContract["agentRole"];
  readonly turnProtocol: CoachingReviewerContract["turnProtocol"];
  readonly toolRecipes: CoachingReviewerContract["toolRecipes"];
  readonly visualBudget: CoachingReviewerContract["visualBudget"];
  readonly prohibitedActions: CoachingReviewerContract["prohibitedActions"];
}

export function buildGetCoachingPolicyOutput(context: AgentContext): GetCoachingPolicyOutput {
  const policy = context.challenge.coachingPolicy;
  return {
    policyVersion: "wmp-1",
    policyDigest: "faultline-reviewer-wmp-1",
    summary: "Use simulator evidence as truth; give one grounded finding and one focused question; preserve human ownership and request consent before simulated experiments.",
    policyText: buildCoachingPolicy(context),
    focusThemes: policy?.focusThemes ?? [],
    prohibitedRevealCategories: policy?.prohibitedRevealCategories ?? [],
    agentRole: REVIEWER_CONTRACT.agentRole,
    turnProtocol: REVIEWER_CONTRACT.turnProtocol,
    toolRecipes: REVIEWER_CONTRACT.toolRecipes,
    visualBudget: REVIEWER_CONTRACT.visualBudget,
    prohibitedActions: REVIEWER_CONTRACT.prohibitedActions,
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
    "Read Faultline's adapter-neutral reviewer contract: read-first turn protocol, targeted evidence recipes, spatial budget, prohibited actions, and challenge learning themes. Call before coaching the player.",
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
