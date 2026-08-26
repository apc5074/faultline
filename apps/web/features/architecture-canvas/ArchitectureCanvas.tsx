"use client";

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState, type DragEvent } from "react";

import { tinyApiChallenge } from "@faultline/challenges";
import { componentRegistry, postgresTierModels, postgresReadCapacityForConfig, postgresReadReplicaBounds, postgresWriteCapacityForConfig, serviceCapacityForConfig, serviceSizeModels, redisEffectiveModel, redisHitRateForConfig, redisTtlHitRateBands, redisTierModels, loadBalancerMonthlyCost, loadBalancerPolicies, cdnConfiguredHitIntent, cdnHitRateForConfig, cdnMonthlyCostForConfig, cdnThroughputCapacityForConfig, cdnTtlHitRateBands, cdnTierModels } from "@faultline/component-catalog";
import { checkConnectionCompatibility, type Architecture, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection, type RequirementDefinition, type RequirementResult } from "@faultline/core";
import {
  estimateMonthlyCost,
  evaluateRequirements,
  type PostgresCapacityMetrics,
  type RequirementsEvaluationResult,
  type ServiceCapacityMetrics,
  type SimulationValidationError,
} from "@faultline/simulator";

type CapacityVisualState = ServiceCapacityMetrics["state"] | PostgresCapacityMetrics["state"];

type ArchitectureNodeData = {
  component: ComponentInstance;
  definition: ComponentDefinition;
  serviceMetrics?: ServiceCapacityMetrics;
  postgresMetrics?: PostgresCapacityMetrics;
  resultIsStale: boolean;
};

type ArchitectureNode = Node<ArchitectureNodeData, "architecture">;

type FlowConnectionLike = {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
};

type SimulationRunState = "idle" | "running" | "complete" | "error";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

const initialArchitecture: Architecture = {
  version: 1,
  components: [],
  connections: [],
};

/** Simulation-relevant architecture fingerprint; UI position changes do not invalidate results. */
function architectureSimulationKey(architecture: Architecture): string {
  return JSON.stringify({
    components: architecture.components.map((component) => ({
      id: component.id,
      type: component.type,
      config: component.config,
    })),
    connections: architecture.connections,
  });
}

function formatUtilization(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function utilizationBarFill(ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1) * 100;
}

function componentToNode(
  component: ComponentInstance,
  selectedComponentId: string | null,
  simulation: SuccessfulSimulation | null,
  resultIsStale: boolean,
): ArchitectureNode {
  const definition = componentRegistry.get(component.type);
  return {
    id: component.id,
    type: "architecture",
    position: component.ui,
    data: {
      component,
      definition,
      serviceMetrics: simulation?.services[component.id],
      postgresMetrics: simulation?.postgres[component.id],
      resultIsStale,
    },
    selected: component.id === selectedComponentId,
  };
}

function CapacityMeter({
  label,
  ratio,
  state,
}: {
  label: string;
  ratio: number;
  state: CapacityVisualState;
}) {
  return (
    <div className={`capacity-meter capacity-meter--${state}`} aria-label={`${label} ${formatUtilization(ratio)}, ${state}`}>
      <div className="capacity-meter__row">
        <span>{label}</span>
        <strong>{formatUtilization(ratio)}</strong>
      </div>
      <div className="capacity-meter__track" aria-hidden="true">
        <div className="capacity-meter__fill" style={{ width: `${utilizationBarFill(ratio)}%` }} />
      </div>
    </div>
  );
}

function ArchitectureNodeCard({ data, selected }: NodeProps<ArchitectureNode>) {
  const state = data.serviceMetrics?.state ?? data.postgresMetrics?.state;
  const stateClass = state ? ` architecture-node--${state}` : "";
  const staleClass = data.resultIsStale && state ? " architecture-node--stale" : "";

  return (
    <article className={`architecture-node${stateClass}${staleClass}${selected ? " architecture-node--selected" : ""}`}>
      {data.definition.ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className="architecture-node__handle"
          type={port.direction === "input" ? "target" : "source"}
          position={port.direction === "input" ? Position.Left : Position.Right}
          aria-label={port.label}
        />
      ))}
      <p className="architecture-node__eyebrow">{state ? state : "Component"}</p>
      <strong>{data.definition.label}</strong>
      <span>{data.component.id}</span>
      {data.serviceMetrics ? (
        <CapacityMeter label="Utilization" ratio={data.serviceMetrics.utilization} state={data.serviceMetrics.state} />
      ) : null}
      {data.postgresMetrics ? (
        <div className="architecture-node__meters">
          <CapacityMeter label="Read" ratio={data.postgresMetrics.readUtilization} state={data.postgresMetrics.state} />
          <CapacityMeter label="Write" ratio={data.postgresMetrics.writeUtilization} state={data.postgresMetrics.state} />
        </div>
      ) : null}
    </article>
  );
}

const nodeTypes = { architecture: ArchitectureNodeCard };

function ComponentPalette({ definitions }: { definitions: readonly ComponentDefinition[] }) {
  return (
    <aside className="component-palette" aria-label="Component palette">
      <p className="component-palette__title">Components</p>
      <p className="component-palette__hint">Drag onto the canvas</p>
      {definitions.map((definition) => (
        <div
          key={definition.type}
          className="component-palette__item"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/faultline-component-type", definition.type);
          }}
        >
          <strong>{definition.label}</strong>
          <span>{definition.category}</span>
        </div>
      ))}
    </aside>
  );
}

function formatCost(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatCompactCost(amount: number): string {
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    const rounded = Math.round(thousands * 10) / 10;
    return `$${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return formatCost(amount);
}

function BudgetHud({ architecture }: { architecture: Architecture }) {
  const cost = estimateMonthlyCost({ architecture, registry: componentRegistry });
  const budget = tinyApiChallenge.monthlyBudget;
  const overBudget = cost.monthlyTotal > budget;

  return (
    <aside className={`budget-hud${overBudget ? " budget-hud--over" : ""}`} aria-label="Infrastructure budget">
      <p className="budget-hud__title">Budget</p>
      <p className="budget-hud__totals">
        <strong>{formatCompactCost(cost.monthlyTotal)}</strong>
        <span>/ {formatCompactCost(budget)}</span>
      </p>
      {overBudget ? (
        <p className="budget-hud__status" role="status">
          Over budget
        </p>
      ) : (
        <p className="budget-hud__status budget-hud__status--ok" role="status">
          Within budget
        </p>
      )}
      {cost.lineItems.length > 0 ? (
        <dl className="budget-hud__breakdown">
          {cost.lineItems.map((lineItem) => {
            const component = architecture.components.find((candidate) => candidate.id === lineItem.componentId);
            const label = component && componentRegistry.has(component.type)
              ? componentRegistry.get(component.type).label
              : lineItem.componentId;
            return (
              <div key={lineItem.componentId}>
                <dt>{label}</dt>
                <dd>{formatCost(lineItem.amount)}</dd>
              </div>
            );
          })}
          <div className="budget-hud__total-row">
            <dt>Total</dt>
            <dd>{formatCost(cost.monthlyTotal)}</dd>
          </div>
        </dl>
      ) : (
        <p className="budget-hud__empty">Add components to estimate monthly cost.</p>
      )}
    </aside>
  );
}

function formatComparator(comparator: RequirementDefinition["comparator"]): string {
  if (comparator === "gte") return ">=";
  if (comparator === "lte") return "<=";
  return "<";
}

function formatRequirementTarget(requirement: RequirementDefinition): string {
  if (requirement.type === "throughput") {
    return `${tinyApiChallenge.workload.requestsPerSecond.toLocaleString("en-US")} req/sec`;
  }
  if (requirement.type === "latency") {
    return `${formatComparator(requirement.comparator)} ${requirement.target}ms`;
  }
  if (requirement.type === "headroom") {
    return `${formatComparator(requirement.comparator)} ${Math.round(requirement.target * 100)}%`;
  }
  return `${formatComparator(requirement.comparator)} ${formatCost(requirement.target)}`;
}

function formatRequirementActual(result: RequirementResult): string {
  if (result.type === "throughput") {
    return `${Math.round(result.actual * 100)}% handled`;
  }
  if (result.type === "latency") {
    return `${result.actual.toFixed(1)}ms`;
  }
  if (result.type === "headroom") {
    return `${Math.round(result.actual * 1000) / 10}%`;
  }
  return formatCost(result.actual);
}

function RequirementsHud({
  result,
  runState,
  resultIsStale,
}: {
  result: SuccessfulSimulation | null;
  runState: SimulationRunState;
  resultIsStale: boolean;
}) {
  const showResults = result !== null && runState === "complete";
  const overallPass = showResults && result.allRequirementsPass;

  return (
    <aside
      className={`requirements-hud${resultIsStale && showResults ? " requirements-hud--stale" : ""}`}
      aria-label="Challenge requirements"
    >
      <p className="requirements-hud__title">Requirements</p>
      <p className="requirements-hud__challenge">{tinyApiChallenge.title}</p>

      {showResults ? (
        <p
          className={`requirements-hud__overall requirements-hud__overall--${overallPass ? "pass" : "fail"}`}
          role="status"
        >
          {overallPass ? "System passes" : "Requirements not met"}
        </p>
      ) : (
        <p className="requirements-hud__overall requirements-hud__overall--pending" role="status">
          Run the system to evaluate
        </p>
      )}

      <ul className="requirements-hud__list">
        {tinyApiChallenge.requirements.map((requirement) => {
          const evaluated = showResults
            ? result.requirements.find((candidate) => candidate.id === requirement.id)
            : undefined;
          const target = formatRequirementTarget(requirement);

          return (
            <li
              key={requirement.id}
              className={`requirements-hud__item${
                evaluated ? ` requirements-hud__item--${evaluated.passed ? "pass" : "fail"}` : ""
              }`}
            >
              <div className="requirements-hud__item-header">
                <strong>{requirement.label}</strong>
                <span aria-hidden="true">
                  {evaluated ? (evaluated.passed ? "✓" : "✕") : "–"}
                </span>
              </div>
              {evaluated ? (
                <>
                  <p className="requirements-hud__values">
                    {formatRequirementActual(evaluated)} / {target}
                  </p>
                  <p className="requirements-hud__status">{evaluated.passed ? "Pass" : "Fail"}</p>
                  {!evaluated.passed ? (
                    <p className="requirements-hud__explanation">{evaluated.explanation}</p>
                  ) : null}
                </>
              ) : (
                <p className="requirements-hud__values">{target}</p>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function SimulationRunPanel({
  runState,
  resultIsStale,
  errors,
  unexpectedError,
  result,
  onRun,
}: {
  runState: SimulationRunState;
  resultIsStale: boolean;
  errors: readonly SimulationValidationError[];
  unexpectedError: string | null;
  result: SuccessfulSimulation | null;
  onRun: () => void;
}) {
  const statusLabel =
    runState === "running"
      ? "Running"
      : runState === "complete"
        ? resultIsStale
          ? "Stale"
          : "Complete"
        : runState === "error"
          ? resultIsStale
            ? "Stale"
            : "Error"
          : "Idle";

  return (
    <div className="simulation-run" aria-label="Simulation controls">
      <div className="simulation-run__controls">
        <button type="button" className="simulation-run__button" onClick={onRun} disabled={runState === "running"}>
          {runState === "running" ? "Running…" : "Run system"}
        </button>
        <p className={`simulation-run__status simulation-run__status--${runState}${resultIsStale ? " simulation-run__status--stale" : ""}`}>
          {statusLabel}
        </p>
      </div>

      {resultIsStale ? (
        <p className="simulation-run__stale" role="status">
          Architecture changed since the last run. Results below are stale — run again for current truth.
        </p>
      ) : null}

      {unexpectedError ? (
        <p className="simulation-run__error" role="alert">
          {unexpectedError}
        </p>
      ) : null}

      {errors.length > 0 ? (
        <ul className="simulation-run__errors" aria-label="Simulation validation errors">
          {errors.map((error, index) => (
            <li key={`${error.code}-${error.componentId ?? error.connectionId ?? index}`}>{error.message}</li>
          ))}
        </ul>
      ) : null}

      {result && runState === "complete" ? (
        <dl className={`simulation-run__result${resultIsStale ? " simulation-run__result--stale" : ""}`} aria-label="Latest simulation result">
          <div>
            <dt>Outcome</dt>
            <dd>{result.allRequirementsPass ? "All requirements passed" : "Requirements failed"}</dd>
          </div>
          <div>
            <dt>p95 latency</dt>
            <dd>{result.p95LatencyMs.toFixed(1)} ms</dd>
          </div>
          <div>
            <dt>Headroom</dt>
            <dd>{Math.round(result.headroom * 1000) / 10}%</dd>
          </div>
          <div>
            <dt>Monthly cost</dt>
            <dd>{formatCost(result.cost.monthlyTotal)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function ComponentInspector({
  architecture,
  component,
  onConfigChange,
}: {
  architecture: Architecture;
  component: ComponentInstance | undefined;
  onConfigChange: (componentId: string, config: unknown) => void;
}) {
  if (!component) {
    return <aside className="component-inspector"><p>Select a component to inspect its configuration.</p></aside>;
  }

  const definition = componentRegistry.get(component.type);
  const cost = estimateMonthlyCost({ architecture, registry: componentRegistry });
  const monthlyCost = cost.lineItems.find((lineItem) => lineItem.componentId === component.id)?.amount ?? 0;

  if (component.type === "service") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const size = parsed.data.size as keyof typeof serviceSizeModels;
    const instances = parsed.data.instances as number;
    const sizeModel = serviceSizeModels[size];
    return (
      <aside className="component-inspector" aria-label="Stateless Service inspector">
        <p className="component-inspector__eyebrow">Stateless Service</p>
        <label>
          Size
          <select
            value={size}
            onChange={(event) => onConfigChange(component.id, { size: event.target.value, instances })}
          >
            {Object.keys(serviceSizeModels).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Instances
          <input
            type="number"
            min="1"
            max="10"
            step="1"
            value={instances}
            onChange={(event) => onConfigChange(component.id, { size, instances: Number(event.target.value) })}
          />
        </label>
        <dl>
          <div><dt>Capacity / instance</dt><dd>{sizeModel.capacityPerInstance.toLocaleString()} req/sec</dd></div>
          <div><dt>Estimated capacity</dt><dd>{serviceCapacityForConfig({ size, instances }).toLocaleString()} req/sec</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
      </aside>
    );
  }

  if (component.type === "postgres") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const tier = parsed.data.tier as keyof typeof postgresTierModels;
    const readReplicaCount = parsed.data.readReplicaCount as number;
    const model = postgresTierModels[tier];
    return (
      <aside className="component-inspector" aria-label="Postgres inspector">
        <p className="component-inspector__eyebrow">Postgres</p>
        <label>
          Tier
          <select
            value={tier}
            onChange={(event) => onConfigChange(component.id, { tier: event.target.value, readReplicaCount })}
          >
            {Object.keys(postgresTierModels).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Read replicas
          <input
            type="number"
            min={postgresReadReplicaBounds.minimum}
            max={postgresReadReplicaBounds.maximum}
            step="1"
            value={readReplicaCount}
            onChange={(event) =>
              onConfigChange(component.id, { tier, readReplicaCount: Number(event.target.value) })
            }
          />
        </label>
        <dl>
          <div>
            <dt>Read capacity</dt>
            <dd>{postgresReadCapacityForConfig({ tier, readReplicaCount }).toLocaleString()} req/sec</dd>
          </div>
          <div>
            <dt>Write capacity</dt>
            <dd>{postgresWriteCapacityForConfig({ tier }).toLocaleString()} req/sec</dd>
          </div>
          <div><dt>Primary read</dt><dd>{model.readCapacityRps.toLocaleString()} req/sec</dd></div>
          <div>
            <dt>Per replica read</dt>
            <dd>{model.replicaReadCapacityRps.toLocaleString()} req/sec</dd>
          </div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
        <p className="component-inspector__hint">
          Replicas add read capacity only. Writes always hit the primary. Region assignment comes later.
        </p>
      </aside>
    );
  }

  if (component.type === "redis") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const mode = parsed.data.mode as "standalone" | "replicated";
    const tier = parsed.data.tier as keyof typeof redisTierModels;
    const ttlBand = parsed.data.ttlBand as keyof typeof redisTtlHitRateBands;
    const effective = redisEffectiveModel({ mode, tier });
    return (
      <aside className="component-inspector" aria-label="Redis inspector">
        <p className="component-inspector__eyebrow">Redis</p>
        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => onConfigChange(component.id, { mode: event.target.value, tier, ttlBand })}
          >
            <option value="standalone">standalone</option>
            <option value="replicated">replicated</option>
          </select>
        </label>
        <label>
          Tier
          <select
            value={tier}
            onChange={(event) => onConfigChange(component.id, { mode, tier: event.target.value, ttlBand })}
          >
            {Object.keys(redisTierModels).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          TTL band
          <select
            value={ttlBand}
            onChange={(event) => onConfigChange(component.id, { mode, tier, ttlBand: event.target.value })}
          >
            {Object.keys(redisTtlHitRateBands).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <dl>
          <div><dt>Configured hit rate</dt><dd>{Math.round(redisHitRateForConfig({ ttlBand }) * 100)}%</dd></div>
          <div><dt>Throughput capacity</dt><dd>{effective.throughputRps.toLocaleString()} req/sec</dd></div>
          <div><dt>Hot-key capacity</dt><dd>{effective.hotKeyCapacityRps.toLocaleString()} req/sec</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
        <p className="component-inspector__hint">
          Cache hits reduce Postgres reads once cache simulation is active. Writes always reach Postgres.
        </p>
      </aside>
    );
  }

  if (component.type === "global-router") {
    return (
      <aside className="component-inspector" aria-label="Global Router inspector">
        <p className="component-inspector__eyebrow">Global Router</p>
        <dl>
          <div><dt>Phase 2 role</dt><dd>Logical request passthrough</dd></div>
          <div><dt>Geographic routing</dt><dd>Inactive</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(0)}</dd></div>
        </dl>
        <p className="component-inspector__hint">
          Forwards traffic without changing volume. Nearest healthy region routing activates when geography is enabled.
        </p>
      </aside>
    );
  }

  if (component.type === "load-balancer") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const policy = parsed.data.policy as (typeof loadBalancerPolicies)[number];
    return (
      <aside className="component-inspector" aria-label="Load Balancer inspector">
        <p className="component-inspector__eyebrow">Load Balancer</p>
        <label>
          Policy
          <select
            value={policy}
            onChange={(event) => onConfigChange(component.id, { policy: event.target.value })}
          >
            {loadBalancerPolicies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <dl>
          <div><dt>Monthly cost</dt><dd>{formatCost(loadBalancerMonthlyCost)}</dd></div>
        </dl>
        <p className="component-inspector__hint">
          {policy === "equal"
            ? "Splits requests evenly across connected services."
            : "Splits requests by each service's configured capacity."}{" "}
          Failed backends are not excluded yet; health-aware redistribution comes with failure injection.
        </p>
      </aside>
    );
  }

  if (component.type === "cdn") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const coverage = parsed.data.coverage as number;
    const ttlBand = parsed.data.ttlBand as keyof typeof cdnTtlHitRateBands;
    const tier = parsed.data.tier as keyof typeof cdnTierModels;
    return (
      <aside className="component-inspector" aria-label="CDN inspector">
        <p className="component-inspector__eyebrow">CDN</p>
        <label>
          Coverage
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={coverage}
            onChange={(event) =>
              onConfigChange(component.id, { coverage: Number(event.target.value), ttlBand, tier })
            }
          />
        </label>
        <label>
          TTL band
          <select
            value={ttlBand}
            onChange={(event) => onConfigChange(component.id, { coverage, ttlBand: event.target.value, tier })}
          >
            {Object.keys(cdnTtlHitRateBands).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tier
          <select
            value={tier}
            onChange={(event) => onConfigChange(component.id, { coverage, ttlBand, tier: event.target.value })}
          >
            {Object.keys(cdnTierModels).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <dl>
          <div><dt>TTL hit rate</dt><dd>{Math.round(cdnHitRateForConfig({ ttlBand }) * 100)}%</dd></div>
          <div>
            <dt>Configured hit intent</dt>
            <dd>{Math.round(cdnConfiguredHitIntent({ coverage, ttlBand, tier }) * 100)}%</dd>
          </div>
          <div><dt>Edge capacity</dt><dd>{cdnThroughputCapacityForConfig({ tier }).toLocaleString()} req/sec</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(cdnMonthlyCostForConfig({ tier }))}</dd></div>
        </dl>
        <p className="component-inspector__hint">
          Reduces origin redirect traffic once cache simulation is active. Writes always miss and reach origin. Coverage is logical, not geographic.
        </p>
      </aside>
    );
  }

  return (
    <aside className="component-inspector" aria-label="Traffic Source inspector">
      <p className="component-inspector__eyebrow">Traffic Source</p>
      <dl>
        <div><dt>Workload</dt><dd>{tinyApiChallenge.workload.requestsPerSecond.toLocaleString()} req/sec</dd></div>
        <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
      </dl>
      <p className="component-inspector__hint">Traffic is configured by the challenge and cannot be edited here.</p>
    </aside>
  );
}

function createComponentInstance(definition: ComponentDefinition, position: { x: number; y: number }): ComponentInstance {
  const parsedConfig = definition.configSchema.safeParse(structuredClone(definition.defaultConfig));
  if (!parsedConfig.success) throw new Error(`Default configuration for ${definition.type} is invalid.`);

  return {
    id: `${definition.type}-${crypto.randomUUID()}`,
    type: definition.type,
    config: parsedConfig.data,
    deployments: [],
    ui: position,
  };
}

function connectionToEdge(
  connection: ArchitectureConnection,
  activeConnectionIds: ReadonlySet<string>,
  trafficActive: boolean,
  resultIsStale: boolean,
): Edge {
  const active = trafficActive && activeConnectionIds.has(connection.id);
  return {
    id: connection.id,
    source: connection.sourceComponentId,
    sourceHandle: connection.sourcePortId,
    target: connection.targetComponentId,
    targetHandle: connection.targetPortId,
    label: connection.type,
    animated: active && !resultIsStale,
    className: [
      "architecture-edge",
      active ? "architecture-edge--active" : "",
      active && resultIsStale ? "architecture-edge--stale" : "",
    ]
      .filter(Boolean)
      .join(" "),
    style: active
      ? {
          stroke: resultIsStale ? "#6b7280" : "#7bc4ff",
          strokeWidth: 2.5,
        }
      : undefined,
  };
}

function connectionFromFlow(connection: FlowConnectionLike, components: readonly ComponentInstance[]): ArchitectureConnection | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return null;
  const source = components.find((component) => component.id === connection.source);
  const target = components.find((component) => component.id === connection.target);
  if (!source || !target || !componentRegistry.has(source.type) || !componentRegistry.has(target.type)) return null;

  const sourcePort = componentRegistry.get(source.type).ports.find((port) => port.id === connection.sourceHandle);
  const targetPort = componentRegistry.get(target.type).ports.find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return null;

  const type = sourcePort.connectionTypes.find((candidate) => targetPort.connectionTypes.includes(candidate));
  if (!type || !checkConnectionCompatibility(sourcePort, targetPort, type).valid) return null;

  return {
    id: `connection-${crypto.randomUUID()}`,
    sourceComponentId: source.id,
    sourcePortId: sourcePort.id,
    targetComponentId: target.id,
    targetPortId: targetPort.id,
    type,
  };
}

function ArchitectureWorkspace() {
  const [architecture, setArchitecture] = useState<Architecture>(initialArchitecture);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [runState, setRunState] = useState<SimulationRunState>("idle");
  const [simulationResult, setSimulationResult] = useState<SuccessfulSimulation | null>(null);
  const [simulationErrors, setSimulationErrors] = useState<readonly SimulationValidationError[]>([]);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const paletteDefinitions = useMemo(
    () => componentRegistry.list().filter((definition) => tinyApiChallenge.allowedComponentTypes.includes(definition.type)),
    [],
  );
  const simulationKey = useMemo(() => architectureSimulationKey(architecture), [architecture]);
  const resultIsStale = lastRunKey !== null && lastRunKey !== simulationKey;
  const showSimulationVisuals = simulationResult !== null && runState === "complete";
  const activeConnectionIds = useMemo(() => {
    if (!simulationResult) return new Set<string>();
    return new Set(
      simulationResult.events
        .filter((event) => event.type === "traffic_routed" && event.connectionId)
        .map((event) => event.connectionId as string),
    );
  }, [simulationResult]);

  const nodes = useMemo(
    () =>
      architecture.components.map((component) =>
        componentToNode(component, selectedComponentId, showSimulationVisuals ? simulationResult : null, resultIsStale),
      ),
    [architecture.components, selectedComponentId, showSimulationVisuals, simulationResult, resultIsStale],
  );
  const edges = useMemo(
    () =>
      architecture.connections.map((connection) =>
        connectionToEdge(connection, activeConnectionIds, showSimulationVisuals, resultIsStale),
      ),
    [architecture.connections, activeConnectionIds, showSimulationVisuals, resultIsStale],
  );
  const selectedComponent = architecture.components.find((component) => component.id === selectedComponentId);

  const onNodesChange = useCallback((changes: NodeChange<ArchitectureNode>[]) => {
    setArchitecture((current) => {
      let components = current.components;

      for (const change of changes) {
        if (change.type === "position") {
          const position = change.position;
          if (!position) continue;
          components = components.map((component) =>
            component.id === change.id ? { ...component, ui: position } : component,
          );
        }

        if (change.type === "remove") {
          components = components.filter((component) => component.id !== change.id);
        }
      }

      if (components === current.components) return current;

      const componentIds = new Set(components.map((component) => component.id));
      return {
        ...current,
        components,
        connections: current.connections.filter(
          (connection) => componentIds.has(connection.sourceComponentId) && componentIds.has(connection.targetComponentId),
        ),
      };
    });

    for (const change of changes) {
      if (change.type === "select") setSelectedComponentId(change.selected ? change.id : null);
      if (change.type === "remove" && change.id === selectedComponentId) setSelectedComponentId(null);
    }
  }, [selectedComponentId]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/faultline-component-type");
    if (!tinyApiChallenge.allowedComponentTypes.includes(type) || !componentRegistry.has(type)) return;

    const component = createComponentInstance(
      componentRegistry.get(type),
      screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
    setArchitecture((current) => ({ ...current, components: [...current.components, component] }));
    setSelectedComponentId(component.id);
  }, [screenToFlowPosition]);

  const onConfigChange = useCallback((componentId: string, config: unknown) => {
    setArchitecture((current) => {
      const component = current.components.find((candidate) => candidate.id === componentId);
      if (!component) return current;
      const parsed = componentRegistry.get(component.type).configSchema.safeParse(config);
      if (!parsed.success) return current;
      return {
        ...current,
        components: current.components.map((candidate) => candidate.id === componentId ? { ...candidate, config: parsed.data } : candidate),
      };
    });
  }, []);

  const isValidConnection = useCallback(
    (connection: FlowConnection | Edge) => connectionFromFlow(connection, architecture.components) !== null,
    [architecture.components],
  );

  const onConnect = useCallback((connection: FlowConnection) => {
    setArchitecture((current) => {
      const canonicalConnection = connectionFromFlow(connection, current.components);
      if (!canonicalConnection) return current;
      const isDuplicate = current.connections.some((existing) =>
        existing.sourceComponentId === canonicalConnection.sourceComponentId &&
        existing.sourcePortId === canonicalConnection.sourcePortId &&
        existing.targetComponentId === canonicalConnection.targetComponentId &&
        existing.targetPortId === canonicalConnection.targetPortId &&
        existing.type === canonicalConnection.type,
      );
      return isDuplicate ? current : { ...current, connections: [...current.connections, canonicalConnection] };
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removedIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    if (removedIds.size === 0) return;
    setArchitecture((current) => ({
      ...current,
      connections: current.connections.filter((connection) => !removedIds.has(connection.id)),
    }));
  }, []);

  const onRunSimulation = useCallback(() => {
    const runKey = architectureSimulationKey(architecture);
    setRunState("running");
    setUnexpectedError(null);

    // Defer so the running state can paint before the synchronous simulator returns.
    window.setTimeout(() => {
      try {
        const outcome = evaluateRequirements({
          architecture,
          challenge: tinyApiChallenge,
          registry: componentRegistry,
        });

        setLastRunKey(runKey);

        if (!outcome.valid) {
          setSimulationResult(null);
          setSimulationErrors(outcome.errors);
          setRunState("error");
          return;
        }

        setSimulationErrors([]);
        setSimulationResult(outcome);
        setRunState("complete");
      } catch (error) {
        setSimulationResult(null);
        setSimulationErrors([]);
        setLastRunKey(runKey);
        setUnexpectedError(error instanceof Error ? error.message : "Simulation failed unexpectedly.");
        setRunState("error");
      }
    }, 0);
  }, [architecture]);

  return (
    <section className="architecture-workspace" aria-label="Logical architecture workspace">
      <ComponentPalette definitions={paletteDefinitions} />
      <div className="architecture-canvas" aria-label="Logical architecture canvas">
      <div className="architecture-canvas__header">
        <div>
          <p className="wordmark">FAULTLINE</p>
          <h1>Logical architecture</h1>
        </div>
        <p>Move components to shape the design. Select a node, then press Delete to remove it.</p>
      </div>
      <SimulationRunPanel
        runState={runState}
        resultIsStale={resultIsStale}
        errors={simulationErrors}
        unexpectedError={unexpectedError}
        result={simulationResult}
        onRun={onRunSimulation}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.4}
        maxZoom={1.8}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      </div>
      <div className="architecture-sidebar">
        <BudgetHud architecture={architecture} />
        <RequirementsHud result={simulationResult} runState={runState} resultIsStale={resultIsStale} />
        <ComponentInspector architecture={architecture} component={selectedComponent} onConfigChange={onConfigChange} />
      </div>
    </section>
  );
}

export function ArchitectureCanvas() {
  return (
    <ReactFlowProvider>
      <ArchitectureWorkspace />
    </ReactFlowProvider>
  );
}
