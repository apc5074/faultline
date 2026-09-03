import type { AgentCapability } from "../capability.js";
import type {
  AgentComponentEvidence,
  AgentContext,
  AgentScenarioEvidence,
  AgentSystemMetrics,
  EvidenceMeta,
} from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

export interface GetMetricsSystem {
  readonly redirectP95Ms?: number;
  readonly throughputPass?: boolean;
  readonly minimumHeadroom?: number;
}

export interface GetMetricsComponent {
  readonly id: string;
  readonly utilization?: number;
  readonly state?: string;
  readonly hitRate?: number;
  readonly readUtilization?: number;
  readonly writeUtilization?: number;
}

export interface GetMetricsScenarios {
  readonly hotKey?: {
    readonly passed: boolean;
  };
  readonly processing?: {
    readonly deadlineCompletionRatio: number;
    readonly deadlineMissRatio: number;
  };
  readonly playback?: {
    readonly requestedStartsPerSecond: number;
    readonly cdnHitStartsPerSecond: number;
    readonly originReadStartsPerSecond: number;
    readonly startupP95LatencyMs: number;
  };
}

export type GetMetricsOutput =
  | {
      readonly simulationAvailable: false;
      readonly validationErrors: readonly string[];
      readonly evidence?: EvidenceMeta;
    }
  | {
      readonly system: GetMetricsSystem;
      readonly components: readonly GetMetricsComponent[];
      readonly scenarios: GetMetricsScenarios;
      readonly evidence?: EvidenceMeta;
    };

function compactSystem(system: AgentSystemMetrics | undefined): GetMetricsSystem {
  if (!system) return {};
  return {
    ...(system.redirectP95Ms !== undefined ? { redirectP95Ms: system.redirectP95Ms } : {}),
    ...(system.throughputPass !== undefined ? { throughputPass: system.throughputPass } : {}),
    ...(system.minimumHeadroom !== undefined ? { minimumHeadroom: system.minimumHeadroom } : {}),
  };
}

function compactComponent(id: string, evidence: AgentComponentEvidence): GetMetricsComponent {
  const { metrics, state } = evidence;
  const utilization =
    typeof metrics.utilization === "number"
      ? metrics.utilization
      : typeof metrics.effectiveUtilization === "number"
        ? metrics.effectiveUtilization
        : undefined;

  return {
    id,
    ...(utilization !== undefined ? { utilization } : {}),
    ...(state !== undefined ? { state } : {}),
    ...(typeof metrics.hitRate === "number" ? { hitRate: metrics.hitRate } : {}),
    ...(typeof metrics.readUtilization === "number" ? { readUtilization: metrics.readUtilization } : {}),
    ...(typeof metrics.writeUtilization === "number" ? { writeUtilization: metrics.writeUtilization } : {}),
  };
}

function compactScenarios(scenarios: AgentScenarioEvidence | undefined): GetMetricsScenarios {
  if (!scenarios) return {};
  return {
    ...(scenarios.hotKey ? { hotKey: { passed: scenarios.hotKey.passed } } : {}),
    ...(scenarios.processing ? { processing: scenarios.processing } : {}),
    ...(scenarios.playback ? { playback: {
      requestedStartsPerSecond: scenarios.playback.requestedStartsPerSecond,
      cdnHitStartsPerSecond: scenarios.playback.cdnHitStartsPerSecond,
      originReadStartsPerSecond: scenarios.playback.originReadStartsPerSecond,
      startupP95LatencyMs: scenarios.playback.startupP95LatencyMs,
    } } : {}),
  };
}

function unavailable(validationErrors: readonly string[], evidence: EvidenceMeta | undefined): GetMetricsOutput {
  return {
    simulationAvailable: false,
    validationErrors,
    ...(evidence ? { evidence } : {}),
  };
}

/**
 * Compact simulator truth for agent grounding.
 * Reads AgentContext evidence only — does not re-run or re-derive simulator formulas.
 */
export function buildGetMetricsOutput(context: AgentContext): GetMetricsOutput {
  const evidence = context.evidenceMeta;
  const simulation = context.simulation;
  if (!simulation) {
    return unavailable(["Simulation evidence is not available."], evidence);
  }
  if (simulation.available !== true) {
    return unavailable(simulation.validationErrors ?? ["Architecture could not be simulated."], evidence);
  }

  const components = Object.keys(simulation.components)
    .sort((left, right) => left.localeCompare(right))
    .map((id) => compactComponent(id, simulation.components[id]!));

  return {
    system: compactSystem(simulation.system),
    components,
    scenarios: compactScenarios(simulation.scenarios),
    ...(evidence ? { evidence } : {}),
  };
}

export const getMetricsCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetMetricsOutput>
> = {
  name: "get_metrics",
  description:
    "Return compact simulator truth for system-wide health: system outcomes, per-component metrics, and scenario results. Do not use as a substitute when the player asked about a named or positioned component—call inspect_component instead. Does not fabricate metrics when simulation is unavailable.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return capabilityOk(buildGetMetricsOutput(context));
  },
};
