import type { ComponentInstance, Connection, CostResult, RequirementResult } from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import type {
  AgentContext,
  AgentSimulationEvidence,
  AgentWorkloadChannelEvidence,
} from "../context.js";
import {
  createScopedEntityReference,
  resolveEntityTarget,
  type EntityKind,
} from "../evidence-result.js";
import {
  crossRegionCostFacts,
  deploymentInventoryFromArchitecture,
  type RegionalDeploymentEntry,
} from "../regional-evidence.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import {
  inspectDesignEntityInputSchema,
  type InspectDesignEntityInput,
  type InspectDesignEntityKind,
} from "../schemas.js";
import { buildOutput as buildComponentOutput } from "./inspect-component-selectors.js";
import { experimentReadiness } from "../experiment-readiness.js";
import { createEmptyAgentSessionState, type AgentSessionState } from "../session.js";

const NEIGHBOR_CAP = 3;
const PATH_CAP = 3;
const ENTITY_BYTE_BUDGET = 4096;

export type InspectDesignEntityOutput =
  | InspectDesignEntityComponentOutput
  | InspectDesignEntityConnectionOutput
  | InspectDesignEntityRequirementOutput
  | InspectDesignEntityWorkloadOutput
  | InspectDesignEntityRegionOutput;

export interface InspectDesignEntityComponentOutput {
  readonly kind: "component";
  readonly entityId: string;
  readonly entityRef: string;
  readonly type: string;
  readonly config: ComponentInstance["config"];
  readonly deployments: readonly ComponentInstance["deployments"][number][];
  readonly metrics?: Readonly<Record<string, number>>;
  readonly monthlyCost?: number;
  readonly workloadFit?: unknown;
  readonly neighbors: readonly string[];
  readonly relatedRequirements: readonly RequirementResult[];
  readonly experimentReadiness: ReturnType<typeof experimentReadiness>;
}

export interface InspectDesignEntityConnectionOutput {
  readonly kind: "connection";
  readonly entityId: string;
  readonly entityRef: string;
  readonly sourceComponentId: string;
  readonly targetComponentId: string;
  readonly connectionType: Connection["type"];
  readonly carriedWorkloadChannelIds: readonly string[];
  readonly paths: readonly {
    readonly channelId: string;
    readonly pathId: string;
    readonly status: string;
    readonly failureCode?: string;
    readonly failureReason?: string;
  }[];
  readonly endpointMetrics: readonly {
    readonly componentId: string;
    readonly metrics?: Readonly<Record<string, number>>;
  }[];
  readonly crossesRegionalBoundary: boolean;
  readonly relatedRegions: readonly string[];
}

export interface InspectDesignEntityRequirementOutput {
  readonly kind: "requirement";
  readonly entityId: string;
  readonly entityRef: string;
  readonly configuredTarget?: unknown;
  readonly result?: RequirementResult;
  readonly status: "passed" | "failed" | "deferred" | "unavailable";
  readonly implicatedComponentIds: readonly string[];
  readonly caveats: readonly string[];
  readonly relatedBottlenecks: readonly unknown[];
}

export interface InspectDesignEntityWorkloadOutput {
  readonly kind: "workload";
  readonly entityId: string;
  readonly entityRef: string;
  readonly channel: AgentWorkloadChannelEvidence;
  readonly constrainedHop?: {
    readonly pathId: string;
    readonly componentId?: string;
    readonly connectionId?: string;
    readonly failureCode?: string;
  };
  readonly scenarioDifferences: readonly string[];
}

export interface InspectDesignEntityRegionOutput {
  readonly kind: "region";
  readonly entityId: string;
  readonly entityRef: string;
  readonly originShare?: { readonly redirectRps: number; readonly writeRps: number };
  readonly deployments: readonly RegionalDeploymentEntry[];
  readonly ingressRoutes: readonly unknown[];
  readonly egressRoutes: readonly unknown[];
  readonly redirectP95Ms?: number;
  readonly crossRegionCosts: readonly unknown[];
  readonly regionFailureExperimentAvailable: boolean;
  readonly experimentReadiness: ReturnType<typeof experimentReadiness>;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function entityCandidates(context: AgentContext): Record<EntityKind, readonly string[]> {
  const simulation = context.simulation?.available === true ? context.simulation : undefined;
  return {
    component: context.architecture.components.map((component) => component.id),
    connection: context.architecture.connections.map((connection) => connection.id),
    requirement: [
      ...(context.requirementResults ?? []).map((result) => result.id),
      ...context.challenge.requirements.map((requirement) => requirement.id),
      ...(context.challenge.unscoredTargets ?? []).map((target) => target.id),
    ],
    region: deploymentInventoryFromArchitecture(context.architecture).regions,
    workload: Object.keys(simulation?.workloadPaths ?? {}),
    scenario: [],
    experiment: [],
  };
}

function labelMatchesForKind(
  kind: InspectDesignEntityKind,
  ref: string,
  context: AgentContext,
): readonly string[] {
  const normalized = normalizeLabel(ref);
  if (kind === "component") {
    return context.architecture.components
      .filter((component) =>
        component.id === ref ||
        normalizeLabel(component.type) === normalized ||
        (typeof component.config.label === "string" && normalizeLabel(component.config.label) === normalized),
      )
      .map((component) => component.id);
  }
  if (kind === "connection") {
    return context.architecture.connections.filter((connection) => connection.id === ref).map((connection) => connection.id);
  }
  if (kind === "requirement") {
    const ids = new Set<string>();
    for (const requirement of context.challenge.requirements) {
      if (requirement.id === ref || normalizeLabel(requirement.label) === normalized || normalizeLabel(requirement.type) === normalized) ids.add(requirement.id);
    }
    for (const target of context.challenge.unscoredTargets ?? []) {
      if (target.id === ref || normalizeLabel(target.id) === normalized) ids.add(target.id);
    }
    for (const result of context.requirementResults ?? []) {
      if (result.id === ref) ids.add(result.id);
    }
    return [...ids];
  }
  if (kind === "workload") {
    const channels = context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {};
    return Object.keys(channels).filter((channelId) => channelId === ref || normalizeLabel(channelId) === normalized);
  }
  if (kind === "region") {
    return deploymentInventoryFromArchitecture(context.architecture).regions.filter(
      (regionId) => regionId === ref || normalizeLabel(regionId) === normalized,
    );
  }
  return [];
}

export function resolveInspectDesignEntityTarget(
  kind: InspectDesignEntityKind,
  ref: string,
  context: AgentContext,
):
  | { ok: true; entityId: string }
  | { ok: false; code: "NOT_FOUND" | "INVALID_INPUT"; message: string; choices?: readonly string[] } {
  const revision = context.evidenceMeta?.architectureRevision ?? "unversioned";
  const candidates = entityCandidates(context);
  const scoped = resolveEntityTarget(ref, revision, candidates);
  if (scoped && scoped.kind === kind) return { ok: true, entityId: scoped.entityId };
  if (ref.startsWith("wmp-ent-")) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Scoped entity reference is stale or does not match the current evidence revision.",
    };
  }
  const direct = candidates[kind]?.includes(ref);
  if (direct) return { ok: true, entityId: ref };
  const labelMatches = labelMatchesForKind(kind, ref, context);
  if (labelMatches.length === 1) return { ok: true, entityId: labelMatches[0]! };
  if (labelMatches.length > 1) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: `Ref "${ref}" is ambiguous for kind "${kind}". Choose one of: ${labelMatches.join(", ")}.`,
      choices: [...labelMatches].sort(),
    };
  }
  return { ok: false, code: "NOT_FOUND", message: `Unknown ${kind} "${ref}" for the current design.` };
}

function entityRefFor(context: AgentContext, kind: InspectDesignEntityKind, entityId: string): string {
  return createScopedEntityReference(kind, entityId, context.evidenceMeta?.architectureRevision ?? "unversioned").ref;
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems.filter((item) => item.componentId === componentId).reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
}

function componentNeighbors(context: AgentContext, componentId: string): readonly string[] {
  return context.architecture.connections
    .filter((connection) => connection.sourceComponentId === componentId || connection.targetComponentId === componentId)
    .flatMap((connection) => [connection.sourceComponentId, connection.targetComponentId])
    .filter((id) => id !== componentId)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, NEIGHBOR_CAP);
}

function inspectComponentEntity(context: AgentContext, entityId: string, session: AgentSessionState): InspectDesignEntityComponentOutput {
  const component = context.architecture.components.find((candidate) => candidate.id === entityId)!;
  const base = buildComponentOutput(component, context);
  const packet = context.reviewPackets?.component[entityId];
  return {
    kind: "component",
    entityId,
    entityRef: entityRefFor(context, "component", entityId),
    type: base.type,
    config: base.config,
    deployments: [...component.deployments].sort((left, right) => left.id.localeCompare(right.id)),
    ...(base.metrics ? { metrics: base.metrics } : {}),
    ...(base.monthlyCost !== undefined ? { monthlyCost: base.monthlyCost } : {}),
    ...(base.workloadFit ? { workloadFit: base.workloadFit } : {}),
    neighbors: packet?.neighbors ?? componentNeighbors(context, entityId),
    relatedRequirements: packet?.relatedRequirements ?? (context.requirementResults ?? []).filter((requirement) => requirement.explanation.includes(entityId)).slice(0, NEIGHBOR_CAP),
    experimentReadiness: experimentReadiness(context, session),
  };
}

function deploymentRegions(context: AgentContext, componentId: string): readonly string[] {
  const component = context.architecture.components.find((candidate) => candidate.id === componentId);
  if (!component) return [];
  return [...new Set(component.deployments.map((deployment) => deployment.regionId))].sort();
}

function inspectConnectionEntity(context: AgentContext, entityId: string): InspectDesignEntityConnectionOutput | undefined {
  const connection = context.architecture.connections.find((candidate) => candidate.id === entityId);
  if (!connection) return undefined;
  const simulation = context.simulation?.available === true ? context.simulation : undefined;
  const paths: Array<InspectDesignEntityConnectionOutput["paths"][number]> = [];
  const channelIds = new Set<string>();
  for (const [channelId, channel] of Object.entries(simulation?.workloadPaths ?? {})) {
    for (const path of channel.paths) {
      if (!path.connectionIds.includes(entityId)) continue;
      channelIds.add(channelId);
      paths.push({
        channelId,
        pathId: path.pathId,
        status: path.status,
        ...(path.failureCode ? { failureCode: path.failureCode } : {}),
        ...(path.failureReason ? { failureReason: path.failureReason } : {}),
      });
    }
  }
  const sourceRegions = deploymentRegions(context, connection.sourceComponentId);
  const targetRegions = deploymentRegions(context, connection.targetComponentId);
  const relatedRegions = [...new Set([...sourceRegions, ...targetRegions])].sort();
  const endpointMetrics = [connection.sourceComponentId, connection.targetComponentId].map((componentId) => ({
    componentId,
    ...(simulation?.components[componentId]?.metrics ? { metrics: simulation.components[componentId]!.metrics } : {}),
  }));
  return {
    kind: "connection",
    entityId,
    entityRef: entityRefFor(context, "connection", entityId),
    sourceComponentId: connection.sourceComponentId,
    targetComponentId: connection.targetComponentId,
    connectionType: connection.type,
    carriedWorkloadChannelIds: [...channelIds].sort(),
    paths: paths.slice(0, PATH_CAP),
    endpointMetrics,
    crossesRegionalBoundary: sourceRegions.some((region) => !targetRegions.includes(region)) || targetRegions.some((region) => !sourceRegions.includes(region)),
    relatedRegions,
  };
}

function inspectRequirementEntity(context: AgentContext, entityId: string): InspectDesignEntityRequirementOutput {
  const result = context.requirementResults?.find((candidate) => candidate.id === entityId);
  const configured = context.challenge.requirements.find((requirement) => requirement.id === entityId);
  const deferred = context.challenge.unscoredTargets?.find((target) => target.id === entityId);
  const packet = context.reviewPackets?.requirement[entityId];
  const simulationAvailable = context.simulation?.available === true;
  const status: InspectDesignEntityRequirementOutput["status"] = deferred
    ? "deferred"
    : !simulationAvailable
      ? "unavailable"
      : result
        ? result.passed
          ? "passed"
          : "failed"
        : "unavailable";
  const implicatedComponentIds = packet?.implicatedComponentIds
    ?? Object.values(context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {})
      .flatMap((channel) => channel.paths.filter((path) => path.status !== "complete").flatMap((path) => path.componentIds))
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .sort()
      .slice(0, NEIGHBOR_CAP);
  return {
    kind: "requirement",
    entityId,
    entityRef: entityRefFor(context, "requirement", entityId),
    ...(configured ? { configuredTarget: { type: configured.type, target: configured.target, unit: configured.unit, comparator: configured.comparator } } : {}),
    ...(deferred ? { configuredTarget: { target: deferred.target, unit: deferred.unit, reason: deferred.reason } } : {}),
    ...(result ? { result } : {}),
    status,
    implicatedComponentIds,
    caveats: packet?.caveats ?? (simulationAvailable ? [] : ["Simulator evidence is unavailable for the current revision."]),
    relatedBottlenecks: (packet?.relatedBottlenecks ?? []).slice(0, NEIGHBOR_CAP),
  };
}

function inspectWorkloadEntity(context: AgentContext, entityId: string): InspectDesignEntityWorkloadOutput | undefined {
  const channel = context.simulation?.available === true ? context.simulation.workloadPaths?.[entityId] : undefined;
  if (!channel) return undefined;
  const constrained = channel.paths.find((path) => path.status !== "complete");
  const scenarioDifferences: string[] = [];
  if (context.simulation?.available === true && context.simulation.scenarios?.hotKey?.active) scenarioDifferences.push("hot_key_active");
  return {
    kind: "workload",
    entityId,
    entityRef: entityRefFor(context, "workload", entityId),
    channel,
    ...(constrained ? {
      constrainedHop: {
        pathId: constrained.pathId,
        componentId: constrained.componentIds[0],
        connectionId: constrained.connectionIds[0],
        ...(constrained.failureCode ? { failureCode: constrained.failureCode } : {}),
      },
    } : {}),
    scenarioDifferences,
  };
}

function inspectRegionEntity(context: AgentContext, entityId: string, session: AgentSessionState): InspectDesignEntityRegionOutput {
  const inventory = deploymentInventoryFromArchitecture(context.architecture);
  const simulation = context.simulation?.available === true ? context.simulation : undefined;
  const origin = simulation?.regional?.origins?.find((entry) => entry.regionId === entityId);
  const routes = simulation?.regional?.routes ?? [];
  const ingressRoutes = routes.filter((route) => route.destinationRegion === entityId).slice(0, PATH_CAP);
  const egressRoutes = routes.filter((route) => route.originRegion === entityId).slice(0, PATH_CAP);
  const crossRegionCosts = (context.cost ? crossRegionCostFacts(context.cost) : []).filter(
    (fact) => fact.sourceRegion === entityId || fact.targetRegion === entityId,
  );
  return {
    kind: "region",
    entityId,
    entityRef: entityRefFor(context, "region", entityId),
    ...(origin ? { originShare: { redirectRps: origin.redirectRps, writeRps: origin.writeRps } } : {}),
    deployments: inventory.deployments.filter((deployment) => deployment.regionId === entityId),
    ingressRoutes,
    egressRoutes,
    ...(simulation?.system?.redirectP95Ms !== undefined ? { redirectP95Ms: simulation.system.redirectP95Ms } : {}),
    crossRegionCosts,
    regionFailureExperimentAvailable: inventory.regions.includes(entityId),
    experimentReadiness: experimentReadiness(context, session),
  };
}

function withinByteBudget(output: InspectDesignEntityOutput): boolean {
  return JSON.stringify(output).length <= ENTITY_BYTE_BUDGET;
}

export function inspectDesignEntity(
  context: AgentContext,
  input: InspectDesignEntityInput,
  session: AgentSessionState = createEmptyAgentSessionState(),
): CapabilityResult<InspectDesignEntityOutput> {
  const resolved = resolveInspectDesignEntityTarget(input.kind, input.ref, context);
  if (!resolved.ok) {
    return capabilityError(resolved.code, resolved.message, {
      retryable: resolved.code === "NOT_FOUND",
      ...(resolved.choices ? { recoveryTool: "inspect_design_entity" } : {}),
      ...(resolved.code === "NOT_FOUND" ? { currentEvidenceRevision: context.evidenceMeta?.architectureRevision, recoveryTool: "review_current_design" } : {}),
    });
  }
  let output: InspectDesignEntityOutput | undefined;
  if (input.kind === "component") output = inspectComponentEntity(context, resolved.entityId, session);
  if (input.kind === "connection") output = inspectConnectionEntity(context, resolved.entityId);
  if (input.kind === "requirement") output = inspectRequirementEntity(context, resolved.entityId);
  if (input.kind === "workload") output = inspectWorkloadEntity(context, resolved.entityId);
  if (input.kind === "region") output = inspectRegionEntity(context, resolved.entityId, session);
  if (!output) return capabilityError("NOT_FOUND", `Unknown ${input.kind} "${input.ref}" for the current design.`);
  if (!withinByteBudget(output)) {
    return capabilityError("INVALID_INPUT", `Inspection for ${input.kind} "${resolved.entityId}" exceeds the bounded payload budget. Use expand_design_evidence for deeper context.`);
  }
  return capabilityOk(output);
}

export const inspectDesignEntityCapability: AgentCapability<
  AgentContext,
  InspectDesignEntityInput,
  CapabilityResult<InspectDesignEntityOutput>
> = {
  name: "inspect_design_entity",
  description:
    "Inspect one named design entity: component, connection, requirement, workload channel, or active region. Accepts exact ids or current scoped references; never accepts free-form queries.",
  inputSchema: inspectDesignEntityInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input, options) {
    return inspectDesignEntity(context, input, options?.session);
  },
};
