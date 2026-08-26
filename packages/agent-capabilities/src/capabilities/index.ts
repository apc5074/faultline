import { createAgentCapabilityRegistry, type AgentCapabilityRegistry } from "../registry.js";

import { inspectCacheCapability } from "./inspect-cache.js";
import { inspectReplicationCapability } from "./inspect-replication.js";
import { inspectRegionalTrafficCapability } from "./inspect-regional-traffic.js";
import { estimateCapacityCapability } from "./estimate-capacity.js";
import { getArchitectureCapability } from "./get-architecture.js";
import { getChallengeCapability } from "./get-challenge.js";
import { getCostBreakdownCapability } from "./get-cost-breakdown.js";
import { getMetricsCapability } from "./get-metrics.js";
import { getRequirementsCapability } from "./get-requirements.js";
import { inspectComponentCapability } from "./inspect-component.js";

export { getChallengeCapability, buildGetChallengeOutput } from "./get-challenge.js";
export type { ChallengeSpecialScenario, GetChallengeOutput } from "./get-challenge.js";

export { getCostBreakdownCapability, getCostBreakdown } from "./get-cost-breakdown.js";
export type { CostBreakdownLineItem, GetCostBreakdownOutput } from "./get-cost-breakdown.js";

export { getRequirementsCapability, buildGetRequirementsOutput } from "./get-requirements.js";
export type {
  CompactRequirement,
  GetRequirementsOutput,
  RequirementActivityState,
  RequirementOperatorSymbol,
} from "./get-requirements.js";

export { getArchitectureCapability, buildGetArchitectureOutput } from "./get-architecture.js";
export type {
  CompactComponent,
  CompactConnection,
  CompactDeployment,
  GetArchitectureOutput,
} from "./get-architecture.js";

export { inspectComponentCapability, inspectComponent } from "./inspect-component.js";
export type { InspectComponentOutput } from "./inspect-component.js";

export { inspectCacheCapability, inspectCache } from "./inspect-cache.js";
export type { InspectCacheOutput } from "./inspect-cache.js";

export { inspectReplicationCapability, inspectReplication } from "./inspect-replication.js";
export type { InspectReplicationOutput, ReplicationPrimaryPlacement } from "./inspect-replication.js";

export { inspectRegionalTrafficCapability, inspectRegionalTraffic } from "./inspect-regional-traffic.js";
export type { InspectRegionalTrafficOutput } from "./inspect-regional-traffic.js";

export {
  estimateCapacityCapability,
  estimateCapacity,
  capacityEntriesFromMetrics,
} from "./estimate-capacity.js";
export type {
  CapacityBottleneck,
  CapacityComponentSummary,
  EstimateCapacityArchitectureOutput,
  EstimateCapacityComponentOutput,
  EstimateCapacityOutput,
} from "./estimate-capacity.js";

export { getMetricsCapability, buildGetMetricsOutput } from "./get-metrics.js";
export type {
  GetMetricsComponent,
  GetMetricsOutput,
  GetMetricsScenarios,
  GetMetricsSystem,
} from "./get-metrics.js";

/** Phase 5 MVP capability set. Additional CAP tickets register here. */
export function createDefaultCapabilityRegistry(): AgentCapabilityRegistry {
  return createAgentCapabilityRegistry([
    getChallengeCapability,
    getRequirementsCapability,
    getArchitectureCapability,
    inspectComponentCapability,
    estimateCapacityCapability,
    getMetricsCapability,
    getCostBreakdownCapability,
    inspectCacheCapability,
    inspectReplicationCapability,
    inspectRegionalTrafficCapability,
  ]);
}
