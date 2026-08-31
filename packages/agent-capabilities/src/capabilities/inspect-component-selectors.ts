import type { ComponentInstance, CostResult, JsonObject } from "@faultline/core";

import type { AgentContext, AgentSimulationEvidence, EvidenceMeta } from "../context.js";
import type { ComponentSelector, ComponentType } from "../schemas.js";
import type { AgentWorkloadFitEvidence } from "../workload-fit-evidence.js";

/** Compact component inspection for agent grounding. */
export interface ConnectedComponent {
  readonly id: string;
  readonly type: string;
  readonly connectionId: string;
  readonly connectionType: string;
}

export interface ComponentTopology {
  readonly upstream: readonly ConnectedComponent[];
  readonly downstream: readonly ConnectedComponent[];
}

export interface InspectComponentOutput {
  readonly id: string;
  readonly type: string;
  readonly config: JsonObject;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly monthlyCost?: number;
  readonly workloadFit?: AgentWorkloadFitEvidence;
  readonly evidence?: EvidenceMeta;
  /** Current architecture edges only; no labels, config, or UI data. */
  readonly topology: ComponentTopology;
}

export interface InspectComponentSelectionOutput {
  readonly selection: {
    readonly type: ComponentType;
    readonly scope: ComponentSelector["scope"];
    readonly matchedCount: number;
    readonly resolvedComponentIds: readonly string[];
  };
  readonly components: readonly InspectComponentOutput[];
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems.filter((item) => item.componentId === componentId).reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
}

function evidenceForComponent(simulation: AgentSimulationEvidence | undefined, componentId: string) {
  if (!simulation || simulation.available !== true) return undefined;
  return simulation.components[componentId];
}

function topologyForComponent(component: ComponentInstance, context: AgentContext): ComponentTopology {
  const components = new Map(context.architecture.components.map((candidate) => [candidate.id, candidate]));
  const upstream: ConnectedComponent[] = [];
  const downstream: ConnectedComponent[] = [];
  for (const connection of context.architecture.connections) {
    const isUpstream = connection.targetComponentId === component.id;
    const isDownstream = connection.sourceComponentId === component.id;
    if (!isUpstream && !isDownstream) continue;
    const neighborId = isUpstream ? connection.sourceComponentId : connection.targetComponentId;
    const neighbor = components.get(neighborId);
    if (!neighbor) continue;
    (isUpstream ? upstream : downstream).push({
      id: neighbor.id,
      type: neighbor.type,
      connectionId: connection.id,
      connectionType: connection.type,
    });
  }
  const sortTopology = (left: ConnectedComponent, right: ConnectedComponent) => left.id.localeCompare(right.id) || left.connectionId.localeCompare(right.connectionId);
  upstream.sort(sortTopology);
  downstream.sort(sortTopology);
  return { upstream, downstream };
}

/** Shared component projection for inspect_component and inspect_design_entity. */
export function buildOutput(component: ComponentInstance, context: AgentContext): InspectComponentOutput {
  const evidence = evidenceForComponent(context.simulation, component.id);
  const monthlyCost = monthlyCostForComponent(context.cost, component.id);
  return {
    id: component.id,
    type: component.type,
    config: component.config,
    ...(evidence?.metrics ? { metrics: evidence.metrics } : {}),
    ...(monthlyCost !== undefined ? { monthlyCost } : {}),
    ...(evidence?.workloadFit ? { workloadFit: evidence.workloadFit } : {}),
    ...(context.evidenceMeta ? { evidence: context.evidenceMeta } : {}),
    topology: topologyForComponent(component, context),
  };
}

/** Resolve selector matches in deterministic canvas order; UI order never enters simulation. */
export function selectComponentsBySelector(
  components: readonly ComponentInstance[],
  selector: ComponentSelector,
): readonly ComponentInstance[] {
  const matches = components
    .filter((component) => component.type === selector.type)
    .sort((left, right) => left.ui.y - right.ui.y || left.ui.x - right.ui.x || left.id.localeCompare(right.id));
  return selector.scope === "topmost" ? matches.slice(0, 1) : matches;
}
