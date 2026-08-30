import type {
  AgentContext,
  AgentSessionState,
  AgentWorkloadFitEvidence,
  LiveAgentSnapshot,
} from "@faultline/agent-capabilities";
import {
  buildAgentRegionalEvidence,
  createEmptyAgentSessionState,
  workloadFitFromCacheMetrics,
  workloadFitFromPlacement,
} from "@faultline/agent-capabilities";
import { compactLevelTeachingForAgent } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { evaluateRequirements, SIMULATOR_VERSION, type RequirementsEvaluationResult } from "@faultline/simulator";
import { architectureAvailabilityFingerprint } from "@faultline/agent-capabilities";

function numericMetrics(value: object): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [name, metric] of Object.entries(value)) {
    if (typeof metric === "number" && Number.isFinite(metric)) metrics[name] = metric;
  }
  return metrics;
}

type ComponentEvidenceRow = {
  metrics: Record<string, number>;
  state?: string;
  workloadFit?: AgentWorkloadFitEvidence;
};

function componentEvidence(
  metrics: object & { state?: string },
  workloadFit: AgentWorkloadFitEvidence | undefined,
): ComponentEvidenceRow {
  return {
    metrics: numericMetrics(metrics),
    ...(typeof metrics.state === "string" ? { state: metrics.state } : {}),
    ...(workloadFit ? { workloadFit } : {}),
  };
}

function simulationEvidence(
  result: RequirementsEvaluationResult,
  challenge: ChallengeDefinition,
): AgentContext["simulation"] {
  if (!result.valid) {
    return { available: false, validationErrors: result.errors.map((error) => error.message) };
  }

  const components: Record<string, ComponentEvidenceRow> = {};
  for (const [componentId, metrics] of Object.entries(result.services)) {
    components[componentId] = componentEvidence(metrics, workloadFitFromPlacement(metrics.placement));
  }
  for (const [componentId, metrics] of Object.entries(result.postgres)) {
    components[componentId] = componentEvidence(metrics, workloadFitFromPlacement(metrics.placement));
  }
  for (const [componentId, metrics] of Object.entries(result.caches)) {
    components[componentId] = componentEvidence(metrics, workloadFitFromCacheMetrics(metrics, challenge));
  }
  for (const [componentId, metrics] of Object.entries(result.level2?.queues ?? {})) {
    components[componentId] = componentEvidence(metrics, undefined);
  }
  for (const [componentId, metrics] of Object.entries(result.level2?.workers ?? {})) {
    components[componentId] = componentEvidence(metrics, undefined);
  }
  for (const [componentId, metrics] of Object.entries(result.level2?.objectStorage ?? {})) {
    components[componentId] = componentEvidence(metrics, undefined);
  }

  const throughput = result.requirements.find((requirement) => requirement.type === "throughput");
  return {
    available: true,
    components,
    system: {
      redirectP95Ms: result.p95LatencyMs,
      throughputPass: throughput?.passed,
      minimumHeadroom: result.headroom,
    },
    scenarios: {
      hotKey: { active: result.hotKey.active, passed: result.hotKey.passed },
      ...(result.level2 ? { processing: { deadlineCompletionRatio: result.level2.processing.deadlineCompletionRatio, deadlineMissRatio: result.level2.processing.deadlineMissRatio } } : {}),
      ...(result.level2 ? { playback: result.level2.playback } : {}),
    },
    ...(result.workloadPaths
      ? {
          workloadPaths: Object.fromEntries(
            Object.entries(result.workloadPaths).map(([channelId, resolution]) => [channelId, {
              channelId: resolution.channelId,
              paths: resolution.paths.map((path) => ({
                pathId: path.pathId,
                componentIds: path.componentIds,
                connectionIds: path.connectionIds,
                status: path.status,
                ...(path.failureCode ? { failureCode: path.failureCode } : {}),
                ...(path.failureReason ? { failureReason: path.failureReason } : {}),
                ...(path.terminalRuleId ? { terminalRuleId: path.terminalRuleId } : {}),
              })),
              inactiveComponentIds: resolution.inactiveComponentIds,
            }]),
          ),
        }
      : {}),
    regional: buildAgentRegionalEvidence({
      regionalWorkload: result.regionalWorkload,
      geographicRoutes: result.geographicRoutes,
    }),
  };
}

export interface CreateAgentContextOptions {
  /** Development/benchmark seam; never changes simulator behavior. */
  readonly onSimulatorEvaluation?: (durationMs: number) => void;
}

/** Build one immutable, simulator-grounded capability snapshot from canonical gameplay inputs. */
export function createAgentContext(
  architecture: Architecture,
  challenge: ChallengeDefinition,
  options: CreateAgentContextOptions = {},
): AgentContext {
  const evaluationStartedAt = performance.now();
  const result = evaluateRequirements({ architecture, challenge, registry: componentRegistry });
  options.onSimulatorEvaluation?.(performance.now() - evaluationStartedAt);
  const levelTeaching = compactLevelTeachingForAgent(challenge.slug);
  const architectureRevision = architectureAvailabilityFingerprint(architecture);
  const generatedAt = new Date().toISOString();
  return {
    challenge,
    architecture,
    simulation: simulationEvidence(result, challenge),
    ...(result.valid ? { cost: result.cost } : {}),
    ...(result.valid ? { requirementResults: result.requirements } : {}),
    user: { authenticated: false },
    evidenceMeta: {
      architectureRevision,
      simulationRunId: `live-${SIMULATOR_VERSION}-${architectureRevision}`,
      simulatorVersion: SIMULATOR_VERSION,
      isStale: false,
      generatedAt,
    },
    ...(levelTeaching ? { levelTeaching } : {}),
  };
}

export type { LiveAgentSnapshot };

export type LiveAgentContextFactory = () => LiveAgentSnapshot;

export interface LiveAgentContextSource {
  readonly getArchitecture: () => Architecture;
  readonly getChallenge: () => ChallengeDefinition;
  readonly getSession?: () => AgentSessionState;
}

/** Stable callback that reads the latest canonical gameplay state on every invocation. */
export function createLiveAgentContextFactory(source: LiveAgentContextSource): LiveAgentContextFactory {
  return () => ({
    context: createAgentContext(source.getArchitecture(), source.getChallenge()),
    session: source.getSession?.() ?? createEmptyAgentSessionState(),
  });
}

/** Read domain context from a live agent snapshot (WebMCP adapters). */
export function agentContextFromSnapshot(snapshot: LiveAgentSnapshot): AgentContext {
  return snapshot.context;
}
