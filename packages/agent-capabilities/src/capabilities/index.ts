import { createAgentCapabilityRegistry, type AgentCapabilityRegistry } from "../registry.js";

import { inspectCacheCapability } from "./inspect-cache.js";
import { inspectReplicationCapability } from "./inspect-replication.js";
import { inspectRegionalTrafficCapability } from "./inspect-regional-traffic.js";
import { estimateCapacityCapability } from "./estimate-capacity.js";
import { getArchitectureCapability } from "./get-architecture.js";
import { getChallengeCapability } from "./get-challenge.js";
import { getCoachingPolicyCapability } from "./get-coaching-policy.js";
import { getSessionFocusCapability } from "./get-session-focus.js";
import { getCostBreakdownCapability } from "./get-cost-breakdown.js";
import { getMetricsCapability } from "./get-metrics.js";
import { getRequirementsCapability } from "./get-requirements.js";
import { inspectComponentCapability } from "./inspect-component.js";
import { inspectDesignEntityCapability } from "./inspect-design-entity.js";
import { BASELINE_VISUAL_CAPABILITIES } from "./visual-capabilities.js";
import { runLoadTestCapability } from "./run-load-test.js";
import { changeTrafficPatternCapability } from "./change-traffic-pattern.js";
import { flushCacheCapability } from "./flush-cache.js";
import { injectComponentFailureCapability } from "./inject-component-failure.js";
import { injectRegionFailureCapability } from "./inject-region-failure.js";
import { inspectBottlenecksCapability } from "./inspect-bottlenecks.js";
import { inspectQueueCapability, inspectProcessingCapability, inspectObjectStorageCapability, inspectPlaybackOriginCapability } from "./inspect-level2.js";
import { slowConsumersCapability } from "./slow-consumers.js";
import { reviewCurrentDesignCapability } from "./review-current-design.js";
import { compareDesignEvidenceCapability } from "./compare-design-evidence.js";
import { expandDesignEvidenceCapability } from "./expand-design-evidence.js";
import { inspectComponentOptionCapability } from "./inspect-component-option.js";

export {
  getSessionFocusCapability,
  buildGetSessionFocusOutput,
} from "./get-session-focus.js";
export type { GetSessionFocusOutput } from "./get-session-focus.js";

export {
  getCoachingPolicyCapability,
  buildGetCoachingPolicyOutput,
} from "./get-coaching-policy.js";
export type { GetCoachingPolicyOutput } from "./get-coaching-policy.js";
export type { CoachingReviewerContract, EvidenceCategory, ToolRecipe, VisualBudget } from "../coaching-policy.js";
export { REVIEWER_CONTRACT } from "../coaching-policy.js";

export { getChallengeCapability, buildGetChallengeOutput } from "./get-challenge.js";
export type { ChallengeSpecialScenario, GetChallengeOutput } from "./get-challenge.js";
export type { CompactWorkloadAffinity, CompactWorkloadMechanismAffinity } from "../workload-fit-evidence.js";

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
export { inspectComponentOptionCapability, inspectComponentOption } from "./inspect-component-option.js";
export type { ComponentOptionFacts, InspectComponentOptionOutput } from "./inspect-component-option.js";
export {
  inspectDesignEntityCapability,
  inspectDesignEntity,
  resolveInspectDesignEntityTarget,
} from "./inspect-design-entity.js";
export type {
  InspectDesignEntityOutput,
  InspectDesignEntityComponentOutput,
  InspectDesignEntityConnectionOutput,
  InspectDesignEntityRequirementOutput,
  InspectDesignEntityWorkloadOutput,
  InspectDesignEntityRegionOutput,
} from "./inspect-design-entity.js";

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
export { reviewCurrentDesignCapability, buildReviewCurrentDesignOutput, buildReviewUseCasePackets, buildReviewRevisionDelta, reviewRequestIdentity } from "./review-current-design.js";
export { expandDesignEvidenceCapability, expandDesignEvidence, reviewReference } from "./expand-design-evidence.js";
export type { ExpandDesignEvidenceOutput } from "./expand-design-evidence.js";
export {
  compareDesignEvidenceCapability,
  compareDesignEvidence,
} from "./compare-design-evidence.js";
export type {
  CompareDesignEvidenceOutput,
  CompareBaselineKind,
  ComparisonProvenanceSide,
  ScopedComparisonChanges,
  ScenarioComparisonChanges,
} from "./compare-design-evidence.js";
export type { ReviewCurrentDesignOutput } from "./review-current-design.js";
export type {
  GetMetricsComponent,
  GetMetricsOutput,
  GetMetricsScenarios,
  GetMetricsSystem,
} from "./get-metrics.js";

export {
  BASELINE_VISUAL_CAPABILITIES,
  annotateComponentCapability,
  clearAnnotationsCapability,
  focusComponentCapability,
  focusRegionCapability,
  pinObservationCapability,
  highlightConnectionCapability,
} from "./visual-capabilities.js";
export type { ClearAnnotationsIntent, FocusRegionIntent, VisualAnnotationIntent } from "./visual-capabilities.js";
export type { PinObservationIntent, PinnedObservation } from "../pin-observation.js";
export { runLoadTestCapability } from "./run-load-test.js";
export { changeTrafficPatternCapability } from "./change-traffic-pattern.js";
export { flushCacheCapability } from "./flush-cache.js";
export { injectComponentFailureCapability } from "./inject-component-failure.js";
export { injectRegionFailureCapability } from "./inject-region-failure.js";
export { inspectBottlenecksCapability } from "./inspect-bottlenecks.js";
export { inspectQueueCapability, inspectProcessingCapability, inspectObjectStorageCapability, inspectPlaybackOriginCapability } from "./inspect-level2.js";
export { slowConsumersCapability } from "./slow-consumers.js";

/** Phase 5 MVP capability set. Additional CAP tickets register here. */
export function createDefaultCapabilityRegistry(): AgentCapabilityRegistry {
  return createAgentCapabilityRegistry([
    getCoachingPolicyCapability,
    reviewCurrentDesignCapability,
    expandDesignEvidenceCapability,
    compareDesignEvidenceCapability,
    getSessionFocusCapability,
    getChallengeCapability,
    getRequirementsCapability,
    getArchitectureCapability,
    inspectDesignEntityCapability,
    inspectComponentCapability,
    inspectComponentOptionCapability,
    estimateCapacityCapability,
    getMetricsCapability,
    getCostBreakdownCapability,
    inspectCacheCapability,
    inspectReplicationCapability,
    inspectRegionalTrafficCapability,
    ...BASELINE_VISUAL_CAPABILITIES,
    runLoadTestCapability,
    changeTrafficPatternCapability,
    flushCacheCapability,
    injectComponentFailureCapability,
    injectRegionFailureCapability,
    inspectBottlenecksCapability,
    inspectQueueCapability,
    inspectProcessingCapability,
    inspectObjectStorageCapability,
    inspectPlaybackOriginCapability,
    slowConsumersCapability,
  ]);
}
