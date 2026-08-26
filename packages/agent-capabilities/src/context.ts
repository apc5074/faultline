import type { Architecture, ChallengeDefinition, CostResult } from "@faultline/core";

/**
 * Immutable per-request snapshot for capability execution.
 * Built once after architecture validation and challenge resolution.
 * Simulation/cost evidence is optional until the server grounds the request.
 */
export interface AgentContext {
  readonly challenge: ChallengeDefinition;
  readonly architecture: Architecture;
  /** Compact simulator evidence for this snapshot. Shape is refined by later CAP tickets. */
  readonly simulation?: Readonly<Record<string, unknown>>;
  readonly cost?: CostResult;
  readonly user?: {
    readonly authenticated: boolean;
  };
}
