"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";

import { urlShortenerChallenge } from "@faultline/challenges";
import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { LeaderboardHud } from "@/features/leaderboards/LeaderboardHud";
import { PlayerRankHud } from "@/features/leaderboards/PlayerRankHud";
import {
  OfficialAttemptProvider,
  useOfficialAttempt,
} from "@/features/official-attempt/OfficialAttemptContext";
import type { SubmitOfficialResponse } from "@/app/api/submissions/route";
import { componentRegistry, postgresTierModels, postgresReadCapacityForConfig, postgresReadReplicaBounds, postgresWriteCapacityForConfig, serviceCapacityForConfig, serviceSizeModels, redisEffectiveModel, redisHitRateForConfig, redisTtlHitRateBands, redisTierModels, loadBalancerMonthlyCost, loadBalancerPolicies, cdnConfiguredHitIntent, cdnHitRateForConfig, cdnMonthlyCostForConfig, cdnThroughputCapacityForConfig, cdnTtlHitRateBands, cdnTierModels } from "@faultline/component-catalog";
import { checkConnectionCompatibility, createRegionDeployment, getRegions, isValidRegion, postgresReplicaDeployments, totalServiceInstancesFromDeployments, type Architecture, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection, type RegionDeployment, type RegionId, type RequirementDefinition, type RequirementResult } from "@faultline/core";
import {
  estimateMonthlyCost,
  evaluateRequirements,
  type RequirementsEvaluationResult,
  type SimulationValidationError,
} from "@faultline/simulator";

import { WorldMap, type WorldMapSelection } from "@/features/world-map/WorldMap";
import { AiEngineerPanel } from "@/features/ai-engineer/AiEngineerPanel";
import { AgentContextFactoryProvider } from "@/features/agent-context/AgentContextFactoryContext";
import { useLiveAgentContextFactory } from "@/lib/agent-context/use-live-agent-context-factory";
import { PLAYGROUND_SNAP_GRID, snapPosition } from "@/features/architecture-canvas/canvas-grid";
import { InkConnectionLine } from "@/features/architecture-canvas/InkConnectionLine";
import { InkEdge, type InkEdgeData } from "@/features/architecture-canvas/InkEdge";
import {
  buildEdgePathsFromArchitecture,
  computeHopMarkers,
  computeParallelOffsets,
  connectionLoadFromEvents,
  normalizeConnectionLoad,
} from "@/features/architecture-canvas/ink-edge-routing";
import { playgroundNodeHeight } from "@/features/architecture-canvas/glyph-port-layout";
import { PlaygroundNode, type PlaygroundNodeData } from "@/features/architecture-canvas/PlaygroundNode";
import { glyphDimensionsForProps, glyphPropsFromComponent, type GlyphSimulationResult } from "@/features/playground-glyphs";

type PlaygroundFlowNode = Node<PlaygroundNodeData, "playground">;

type FlowConnectionLike = {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
};

type SimulationRunState = "idle" | "running" | "complete" | "error";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

/** Primary playable Level 1 challenge. Tiny API remains available for package regression. */
const activeChallenge = urlShortenerChallenge;

const challengeRedirectRps =
  activeChallenge.workload.requestsPerSecond * activeChallenge.workload.readRatio;
const challengeWriteRps =
  activeChallenge.workload.requestsPerSecond * activeChallenge.workload.writeRatio;
const challengeHotKeyFraction = activeChallenge.workload.hotKeyReadFraction ?? 0;
const challengeReadWriteRatioLabel =
  challengeWriteRps > 0 ? `${Math.round(challengeRedirectRps / challengeWriteRps)}:1` : "reads only";
const challengeHotKeyLabel =
  challengeHotKeyFraction > 0
    ? `${Math.round(challengeHotKeyFraction * 100)}% viral key`
    : "no viral key";

const initialArchitecture: Architecture = {
  version: 1,
  components: [
    {
      id: "traffic-source-start",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 80, y: 180 },
    },
  ],
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

function simulationSnapshot(simulation: SuccessfulSimulation | null): GlyphSimulationResult | null {
  if (!simulation) return null;
  return {
    services: simulation.services,
    postgres: simulation.postgres,
    caches: simulation.caches,
    events: simulation.events,
  };
}

function connectedPortIdsForComponent(
  componentId: string,
  connections: readonly ArchitectureConnection[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const connection of connections) {
    if (connection.sourceComponentId === componentId) ids.add(connection.sourcePortId);
    if (connection.targetComponentId === componentId) ids.add(connection.targetPortId);
  }
  return ids;
}

function componentToNode(
  component: ComponentInstance,
  connections: readonly ArchitectureConnection[],
  selectedComponentId: string | null,
  simulation: SuccessfulSimulation | null,
  resultIsStale: boolean,
  attentionComponentId: string | null,
): PlaygroundFlowNode {
  const definition = componentRegistry.get(component.type);
  const glyphCatalog = glyphPropsFromComponent(component, definition);
  const dimensions = glyphDimensionsForProps(glyphCatalog);
  return {
    id: component.id,
    type: "playground",
    position: component.ui,
    width: dimensions.width,
    height: playgroundNodeHeight(dimensions.height),
    data: {
      component,
      definition,
      simulation: simulationSnapshot(simulation),
      resultIsStale,
      attention: component.id === attentionComponentId,
      connectedPortIds: connectedPortIdsForComponent(component.id, connections),
    },
    selected: component.id === selectedComponentId,
  };
}

const nodeTypes = { playground: PlaygroundNode };
const edgeTypes = { ink: InkEdge };

function ComponentPalette({ definitions }: { definitions: readonly ComponentDefinition[] }) {
  const grouped = useMemo(() => {
    const categories = new Map<string, ComponentDefinition[]>();
    for (const definition of definitions) {
      const items = categories.get(definition.category) ?? [];
      items.push(definition);
      categories.set(definition.category, items);
    }
    return [...categories.entries()];
  }, [definitions]);

  return (
    <aside className="component-rail" aria-label="Component palette">
      {grouped.map(([category, items], index) => (
        <div key={category} className="component-rail__group">
          {index > 0 ? <div className="component-rail__divider" aria-hidden="true" /> : null}
          <p className="component-rail__category">{category}</p>
          {items.map((definition) => (
            <div
              key={definition.type}
              className="component-rail__item"
              draggable
              title={definition.label}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/faultline-component-type", definition.type);
              }}
            >
              <span>{definition.label}</span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

function PlaygroundDataPlates({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="playground-data-plates">
      <button
        type="button"
        className="playground-data-plates__toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        Challenge & competition
        <span aria-hidden="true">{expanded ? " ▾" : " ▸"}</span>
      </button>
      {expanded ? <div className="playground-data-plates__content">{children}</div> : null}
    </div>
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

function BudgetHud({
  architecture,
  traffic,
  geographicRoutes,
}: {
  architecture: Architecture;
  traffic?: SuccessfulSimulation["traffic"];
  geographicRoutes?: SuccessfulSimulation["geographicRoutes"];
}) {
  const cost = estimateMonthlyCost({
    architecture,
    registry: componentRegistry,
    traffic,
    geographicRoutes,
    challenge: activeChallenge,
  });
  const budget = activeChallenge.monthlyBudget;
  const overBudget = cost.monthlyTotal > budget;

  return (
    <aside className={`budget-hud${overBudget ? " budget-hud--over" : ""}`} aria-label="Infrastructure budget">
      <p className="budget-hud__title">Budget</p>
      <p className="budget-hud__totals tabular">
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
        <dl className="budget-hud__breakdown tabular">
          {cost.lineItems.map((lineItem) => {
            const component = architecture.components.find((candidate) => candidate.id === lineItem.componentId);
            const label =
              lineItem.label ??
              (component && componentRegistry.has(component.type)
                ? componentRegistry.get(component.type).label
                : lineItem.componentId);
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
    return `${activeChallenge.workload.requestsPerSecond.toLocaleString("en-US")} req/sec`;
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
      <p className="requirements-hud__challenge">{activeChallenge.title}</p>
      <p className="requirements-hud__workload">
        {Math.round(challengeRedirectRps).toLocaleString("en-US")} redirects/sec ·{" "}
        {Math.round(challengeWriteRps).toLocaleString("en-US")} writes/sec · {challengeReadWriteRatioLabel} ·{" "}
        {challengeHotKeyLabel}
      </p>

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
        {activeChallenge.requirements.map((requirement) => {
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
                  <p className="requirements-hud__values tabular">
                    {formatRequirementActual(evaluated)} / {target}
                  </p>
                  <p className="requirements-hud__status">{evaluated.passed ? "Pass" : "Fail"}</p>
                  {!evaluated.passed ? (
                    <p className="requirements-hud__explanation">{evaluated.explanation}</p>
                  ) : null}
                </>
              ) : (
                <p className="requirements-hud__values tabular">{target}</p>
              )}
            </li>
          );
        })}
        {(activeChallenge.workload.hotKeyReadFraction ?? 0) > 0 ? (
          <li
            className={`requirements-hud__item${
              showResults && result.hotKey.active
                ? ` requirements-hud__item--${result.hotKey.passed ? "pass" : "fail"}`
                : ""
            }`}
          >
            <div className="requirements-hud__item-header">
              <strong>Hot-key scenario</strong>
              <span aria-hidden="true">
                {showResults && result.hotKey.active ? (result.hotKey.passed ? "✓" : "✕") : "–"}
              </span>
            </div>
            {showResults && result.hotKey.active ? (
              <>
                <p className="requirements-hud__values tabular">
                  {result.hotKey.viralRedirectRps.toLocaleString("en-US")} viral req/sec
                  {" · "}
                  {result.hotKey.viralReachingPostgresRps.toLocaleString("en-US")} to Postgres
                </p>
                <p className="requirements-hud__status">{result.hotKey.passed ? "Pass" : "Fail"}</p>
                {!result.hotKey.passed ? (
                  <p className="requirements-hud__explanation">{result.hotKey.explanation}</p>
                ) : null}
              </>
            ) : (
              <p className="requirements-hud__values tabular">
                {Math.round(challengeHotKeyFraction * 100)}% of redirects on one viral URL
              </p>
            )}
          </li>
        ) : null}
        {activeChallenge.unscoredTargets?.map((target) => (
          <li key={target.id} className="requirements-hud__item requirements-hud__item--deferred">
            <div className="requirements-hud__item-header">
              <strong>{target.label}</strong>
              <span aria-hidden="true">…</span>
            </div>
            <p className="requirements-hud__values tabular">
              ≥{(target.target * 100).toFixed(2)}% · not scored yet
            </p>
            <p className="requirements-hud__explanation">{target.reason}</p>
          </li>
        ))}
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
  officialActive,
  onSubmitOfficial,
  officialSubmitting,
  officialSummary,
}: {
  runState: SimulationRunState;
  resultIsStale: boolean;
  errors: readonly SimulationValidationError[];
  unexpectedError: string | null;
  result: SuccessfulSimulation | null;
  onRun: () => void;
  officialActive: boolean;
  onSubmitOfficial: () => void;
  officialSubmitting: boolean;
  officialSummary: string | null;
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
        <button type="button" className="simulation-run__button" onClick={onRun} disabled={runState === "running" || officialSubmitting}>
          {runState === "running" ? "Running…" : "Run system"}
        </button>
        {officialActive ? (
          <button
            type="button"
            className="simulation-run__button simulation-run__button--official"
            onClick={onSubmitOfficial}
            disabled={runState === "running" || officialSubmitting}
          >
            {officialSubmitting ? "Submitting…" : "Submit Official"}
          </button>
        ) : null}
        <p className={`simulation-run__status simulation-run__status--${runState}${resultIsStale ? " simulation-run__status--stale" : ""}`}>
          {statusLabel}
        </p>
      </div>

      {officialSummary ? (
        <p className="simulation-run__official" role="status">
          {officialSummary}
        </p>
      ) : null}

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
        <dl className={`simulation-run__result tabular${resultIsStale ? " simulation-run__result--stale" : ""}`} aria-label="Latest simulation result">
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
  onDeploymentsChange,
}: {
  architecture: Architecture;
  component: ComponentInstance | undefined;
  onConfigChange: (componentId: string, config: unknown) => void;
  onDeploymentsChange: (componentId: string, deployments: RegionDeployment[]) => void;
}) {
  if (!component) {
    return <aside className="component-inspector"><p>Select a component to inspect its configuration.</p></aside>;
  }

  const definition = componentRegistry.get(component.type);
  const cost = estimateMonthlyCost({ architecture, registry: componentRegistry });
  const monthlyCost = cost.lineItems.find((lineItem) => lineItem.componentId === component.id)?.amount ?? 0;
  const regions = getRegions();

  if (component.type === "service") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const size = parsed.data.size as keyof typeof serviceSizeModels;
    const instances = parsed.data.instances as number;
    const sizeModel = serviceSizeModels[size];
    const regional = component.deployments.length > 0;
    const instancesByRegion = Object.fromEntries(
      regions.map((region) => {
        const deployment = component.deployments.find((entry) => entry.regionId === region.id);
        const count = deployment ? Number(deployment.config.instances ?? 0) : 0;
        return [region.id, Number.isFinite(count) ? count : 0];
      }),
    ) as Record<string, number>;

    const setRegionalInstances = (regionId: string, nextCount: number) => {
      const nextCounts = { ...instancesByRegion, [regionId]: Math.max(0, Math.floor(nextCount)) };
      const nextDeployments: RegionDeployment[] = regions
        .filter((region) => (nextCounts[region.id] ?? 0) > 0)
        .map((region) =>
          createRegionDeployment(region.id, { instances: nextCounts[region.id] }, `dep-${component.id}-${region.id}`),
        );
      onDeploymentsChange(component.id, nextDeployments);
    };

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
          Instances {regional ? "(from regions)" : ""}
          <input
            type="number"
            min="1"
            max="10"
            step="1"
            value={instances}
            disabled={regional}
            onChange={(event) => onConfigChange(component.id, { size, instances: Number(event.target.value) })}
          />
        </label>
        <div className="component-inspector__region-block">
          <p className="component-inspector__region-title">Regional instances</p>
          {regions.map((region) => (
            <label key={region.id}>
              {region.label}
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={instancesByRegion[region.id] ?? 0}
                onChange={(event) => setRegionalInstances(region.id, Number(event.target.value))}
              />
            </label>
          ))}
          <p className="component-inspector__hint">
            When any region is set, regional instances are the capacity source and must sum to the logical total.
          </p>
        </div>
        <dl className="tabular">
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
    const primary = component.deployments.find((deployment) => deployment.config.role === "primary");
    const replicaRegionIds = new Set(
      component.deployments.filter((deployment) => deployment.config.role === "replica").map((deployment) => deployment.regionId),
    );
    const regional = component.deployments.length > 0;

    const setPrimaryRegion = (regionId: string) => {
      if (!regionId || !isValidRegion(regionId)) {
        onDeploymentsChange(component.id, []);
        return;
      }
      const primaryRegionId: RegionId = regionId;
      const replicas = regions
        .filter((region) => replicaRegionIds.has(region.id) && region.id !== primaryRegionId)
        .map((region) => createRegionDeployment(region.id, { role: "replica" }, `dep-${component.id}-${region.id}-replica`));
      onDeploymentsChange(component.id, [
        createRegionDeployment(primaryRegionId, { role: "primary" }, `dep-${component.id}-${primaryRegionId}-primary`),
        ...replicas,
      ]);
    };

    const toggleReplicaRegion = (regionId: string, enabled: boolean) => {
      const primaryRegionId = primary?.regionId;
      if (!primaryRegionId || !isValidRegion(primaryRegionId) || !isValidRegion(regionId)) return;
      const nextReplicaIds = new Set(replicaRegionIds);
      if (enabled) nextReplicaIds.add(regionId);
      else nextReplicaIds.delete(regionId);
      onDeploymentsChange(component.id, [
        createRegionDeployment(primaryRegionId, { role: "primary" }, `dep-${component.id}-${primaryRegionId}-primary`),
        ...regions
          .filter((region) => nextReplicaIds.has(region.id))
          .map((region) =>
            createRegionDeployment(region.id, { role: "replica" }, `dep-${component.id}-${region.id}-replica`),
          ),
      ]);
    };

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
          Read replicas {regional ? "(from regions)" : ""}
          <input
            type="number"
            min={postgresReadReplicaBounds.minimum}
            max={postgresReadReplicaBounds.maximum}
            step="1"
            value={readReplicaCount}
            disabled={regional}
            onChange={(event) =>
              onConfigChange(component.id, { tier, readReplicaCount: Number(event.target.value) })
            }
          />
        </label>
        <div className="component-inspector__region-block">
          <p className="component-inspector__region-title">Regional placement</p>
          <label>
            Primary region
            <select value={primary?.regionId ?? ""} onChange={(event) => setPrimaryRegion(event.target.value)}>
              <option value="">Logical only (no region)</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>
          {primary ? (
            <div className="component-inspector__replica-list">
              <p className="component-inspector__region-title">Read replica regions</p>
              {regions.map((region) => (
                <label key={region.id} className="component-inspector__checkbox">
                  <input
                    type="checkbox"
                    checked={replicaRegionIds.has(region.id)}
                    onChange={(event) => toggleReplicaRegion(region.id, event.target.checked)}
                  />
                  {region.label}
                </label>
              ))}
            </div>
          ) : null}
          <p className="component-inspector__hint">
            Exactly one primary. Writes target the primary. Replica regions set readReplicaCount.
          </p>
        </div>
        <dl className="tabular">
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
            <dt>Replica read pool</dt>
            <dd>{(model.replicaReadCapacityRps * readReplicaCount).toLocaleString()} req/sec</dd>
          </div>
          <div>
            <dt>Per replica read</dt>
            <dd>{model.replicaReadCapacityRps.toLocaleString()} req/sec</dd>
          </div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
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
    const placed = new Set(component.deployments.map((deployment) => deployment.regionId));

    const toggleRegion = (regionId: string, enabled: boolean) => {
      const next = new Set(placed);
      if (enabled) next.add(regionId);
      else next.delete(regionId);
      onDeploymentsChange(
        component.id,
        regions
          .filter((region) => next.has(region.id))
          .map((region) => createRegionDeployment(region.id, {}, `dep-${component.id}-${region.id}`)),
      );
    };

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
        <div className="component-inspector__region-block">
          <p className="component-inspector__region-title">Regional placement</p>
          {regions.map((region) => (
            <label key={region.id} className="component-inspector__checkbox">
              <input
                type="checkbox"
                checked={placed.has(region.id)}
                onChange={(event) => toggleRegion(region.id, event.target.checked)}
              />
              {region.label}
            </label>
          ))}
          <p className="component-inspector__hint">
            Each checked region is an independent Redis cache. Replicated mode is local HA, not cross-region sync.
          </p>
        </div>
        <dl className="tabular">
          <div><dt>Configured hit rate</dt><dd>{Math.round(redisHitRateForConfig({ ttlBand }) * 100)}%</dd></div>
          <div><dt>Throughput capacity</dt><dd>{effective.throughputRps.toLocaleString()} req/sec</dd></div>
          <div><dt>Hot-key capacity</dt><dd>{effective.hotKeyCapacityRps.toLocaleString()} req/sec</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
      </aside>
    );
  }

  if (component.type === "global-router") {
    return (
      <aside className="component-inspector" aria-label="Global Router inspector">
        <p className="component-inspector__eyebrow">Global Router</p>
        <dl className="tabular">
          <div><dt>Role</dt><dd>Logical request passthrough</dd></div>
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
        <dl className="tabular">
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
        <dl className="tabular">
          <div><dt>TTL hit rate</dt><dd>{Math.round(cdnHitRateForConfig({ ttlBand }) * 100)}%</dd></div>
          <div>
            <dt>Configured hit intent</dt>
            <dd>{Math.round(cdnConfiguredHitIntent({ coverage, ttlBand, tier }) * 100)}%</dd>
          </div>
          <div><dt>Edge capacity</dt><dd>{cdnThroughputCapacityForConfig({ tier }).toLocaleString()} req/sec</dd></div>
          <div><dt>Base monthly cost</dt><dd>{formatCost(cdnMonthlyCostForConfig({ tier }))}</dd></div>
        </dl>
        <p className="component-inspector__hint">
          Reduces origin redirect traffic via cache hit/miss offload. Writes always miss and reach origin. Coverage is
          logical, not geographic.
        </p>
      </aside>
    );
  }

  return (
    <aside className="component-inspector" aria-label="Traffic Source inspector">
      <p className="component-inspector__eyebrow">Traffic Source</p>
      <dl className="tabular">
        <div>
          <dt>Workload</dt>
          <dd>
            {Math.round(challengeRedirectRps).toLocaleString("en-US")} redirects/sec ·{" "}
            {Math.round(challengeWriteRps).toLocaleString("en-US")} writes/sec
          </dd>
        </div>
        <div>
          <dt>Geography</dt>
          <dd>Origins from challenge geographic distribution; place capacity via component deployments</dd>
        </div>
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
  context: {
    activeConnectionIds: ReadonlySet<string>;
    trafficActive: boolean;
    resultIsStale: boolean;
    load: number;
    offset: number;
    hops: InkEdgeData["hops"];
  },
): Edge<InkEdgeData, "ink"> {
  const active = context.trafficActive && context.activeConnectionIds.has(connection.id);
  return {
    id: connection.id,
    type: "ink",
    source: connection.sourceComponentId,
    sourceHandle: connection.sourcePortId,
    target: connection.targetComponentId,
    targetHandle: connection.targetPortId,
    data: {
      load: context.load,
      active,
      stale: context.trafficActive && context.resultIsStale,
      offset: context.offset,
      hops: context.hops,
    },
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

function worldSelectionForComponent(
  architecture: Architecture,
  componentId: string | null,
): WorldMapSelection {
  if (!componentId) return null;
  const component = architecture.components.find((entry) => entry.id === componentId);
  const deployment = component?.deployments[0];
  if (!deployment) return null;
  return { kind: "deployment", componentId, deploymentId: deployment.id };
}

function ArchitectureWorkspace() {
  const { session: officialSession, bumpRankRefresh } = useOfficialAttempt();
  const [architecture, setArchitecture] = useState<Architecture>(initialArchitecture);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [attentionComponentId, setAttentionComponentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"logical" | "world">("logical");
  const [worldSelection, setWorldSelection] = useState<WorldMapSelection>(null);
  const [runState, setRunState] = useState<SimulationRunState>("idle");
  const [simulationResult, setSimulationResult] = useState<SuccessfulSimulation | null>(null);
  const [simulationErrors, setSimulationErrors] = useState<readonly SimulationValidationError[]>([]);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const [officialSubmitting, setOfficialSubmitting] = useState(false);
  const [officialSummary, setOfficialSummary] = useState<string | null>(null);
  const [dataPlatesExpanded, setDataPlatesExpanded] = useState(true);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const paletteDefinitions = useMemo(
    () => componentRegistry.list().filter((definition) => activeChallenge.allowedComponentTypes.includes(definition.type)),
    [],
  );
  const getAgentContext = useLiveAgentContextFactory(architecture, activeChallenge);
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
        componentToNode(
          component,
          architecture.connections,
          selectedComponentId,
          showSimulationVisuals ? simulationResult : null,
          resultIsStale,
          attentionComponentId,
        ),
      ),
    [
      architecture.components,
      architecture.connections,
      selectedComponentId,
      showSimulationVisuals,
      simulationResult,
      resultIsStale,
      attentionComponentId,
    ],
  );
  const edges = useMemo(() => {
    const loads = connectionLoadFromEvents(simulationResult?.events);
    const maxLoad = Math.max(...loads.values(), 0);
    const offsets = computeParallelOffsets(
      architecture.connections.map((connection) => ({
        id: connection.id,
        sourceId: connection.sourceComponentId,
        targetId: connection.targetComponentId,
      })),
    );
    const paths = buildEdgePathsFromArchitecture(
      architecture.connections,
      architecture.components,
      (type) => componentRegistry.get(type),
      offsets,
    );
    const hopMap = computeHopMarkers(paths);

    return architecture.connections.map((connection) =>
      connectionToEdge(connection, {
        activeConnectionIds,
        trafficActive: showSimulationVisuals,
        resultIsStale,
        load: normalizeConnectionLoad(loads.get(connection.id) ?? 0, maxLoad),
        offset: offsets.get(connection.id) ?? 0,
        hops: hopMap.get(connection.id) ?? [],
      }),
    );
  }, [architecture.connections, architecture.components, activeConnectionIds, showSimulationVisuals, resultIsStale, simulationResult?.events]);
  const selectedComponent = architecture.components.find((component) => component.id === selectedComponentId);
  const showCanvasEmptyState =
    viewMode === "logical" && architecture.components.length === 1 && architecture.components[0]?.type === "traffic-source";
  useEffect(() => {
    if (attentionComponentId && !architecture.components.some((component) => component.id === attentionComponentId)) {
      setAttentionComponentId(null);
    }
  }, [architecture.components, attentionComponentId]);

  const onNodesChange = useCallback((changes: NodeChange<PlaygroundFlowNode>[]) => {
    setArchitecture((current) => {
      let components = current.components;

      for (const change of changes) {
        if (change.type === "position") {
          const position = change.position;
          if (!position) continue;
          const snapped = snapPosition(position);
          components = components.map((component) =>
            component.id === change.id ? { ...component, ui: snapped } : component,
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
      if (change.type === "select") {
        const nextId = change.selected ? change.id : null;
        setSelectedComponentId(nextId);
        setWorldSelection(worldSelectionForComponent(architecture, nextId));
      }
      if (change.type === "remove" && change.id === selectedComponentId) {
        setSelectedComponentId(null);
        setWorldSelection(null);
      }
    }
  }, [architecture, selectedComponentId]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/faultline-component-type");
    if (!activeChallenge.allowedComponentTypes.includes(type) || !componentRegistry.has(type)) return;

    const component = createComponentInstance(
      componentRegistry.get(type),
      snapPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY })),
    );
    setArchitecture((current) => ({ ...current, components: [...current.components, component] }));
    setSelectedComponentId(component.id);
    setWorldSelection(null);
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

  const onDeploymentsChange = useCallback((componentId: string, deployments: RegionDeployment[]) => {
    setArchitecture((current) => {
      const component = current.components.find((candidate) => candidate.id === componentId);
      if (!component || !componentRegistry.has(component.type)) return current;

      let nextConfig = component.config;
      if (component.type === "service") {
        if (deployments.length === 0) {
          // Leave logical instances unchanged when clearing geography.
        } else {
          const instances = totalServiceInstancesFromDeployments(deployments);
          const parsed = componentRegistry.get(component.type).configSchema.safeParse({
            ...component.config,
            instances,
          });
          if (!parsed.success) return current;
          nextConfig = parsed.data;
        }
      } else if (component.type === "postgres") {
        const readReplicaCount = postgresReplicaDeployments(deployments).length;
        const parsed = componentRegistry.get(component.type).configSchema.safeParse({
          ...component.config,
          readReplicaCount,
        });
        if (!parsed.success) return current;
        nextConfig = parsed.data;
      }

      return {
        ...current,
        components: current.components.map((candidate) =>
          candidate.id === componentId ? { ...candidate, config: nextConfig, deployments } : candidate,
        ),
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
    setOfficialSummary(null);

    // Defer so the running state can paint before the synchronous simulator returns.
    window.setTimeout(() => {
      try {
        const outcome = evaluateRequirements({
          architecture,
          challenge: activeChallenge,
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

  const onSubmitOfficial = useCallback(() => {
    if (!officialSession) return;
    const runKey = architectureSimulationKey(architecture);
    setOfficialSubmitting(true);
    setUnexpectedError(null);
    setOfficialSummary(null);
    setSimulationErrors([]);

    void (async () => {
      try {
        const response = await fetch("/api/submissions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            attemptId: officialSession.attemptId,
            challengeVersion: officialSession.challengeVersion,
            architecture,
          }),
        });
        const body = (await response.json()) as SubmitOfficialResponse;
        setLastRunKey(runKey);

        if (!body.ok) {
          if (body.code === "invalid_architecture" && Array.isArray(body.details)) {
            setSimulationResult(null);
            setSimulationErrors(body.details as SimulationValidationError[]);
            setRunState("error");
            setOfficialSummary(null);
          } else {
            setSimulationResult(null);
            setRunState("error");
            setUnexpectedError(body.error);
          }
          return;
        }

        // Local evaluate fills canvas meters; competition-relevant fields match server verify.
        const outcome = evaluateRequirements({
          architecture,
          challenge: activeChallenge,
          registry: componentRegistry,
        });
        if (!outcome.valid) {
          setSimulationResult(null);
          setSimulationErrors(outcome.errors);
          setRunState("error");
          setUnexpectedError("Server accepted submission but local replay failed validation.");
          return;
        }

        setSimulationErrors([]);
        setSimulationResult(outcome);
        setRunState("complete");

        const solve =
          body.officialSolveMs !== null
            ? ` · official solve ${Math.round(body.officialSolveMs / 1000)}s`
            : "";
        const rank = body.eligible
          ? `Eligible${solve}`
          : body.withinBudget
            ? "Verified — requirements failed (not ranked)"
            : "Verified — over budget (not ranked)";
        const best = body.dailyBest
          ? ` · best ${Math.round(body.dailyBest.fastestSolveMs / 1000)}s / ${formatCost(body.dailyBest.cheapestCost)}`
          : "";
        setOfficialSummary(`Server verified · ${rank}${best}`);
        bumpRankRefresh();
      } catch {
        setUnexpectedError("Could not submit official architecture.");
        setRunState("error");
      } finally {
        setOfficialSubmitting(false);
      }
    })();
  }, [architecture, officialSession, bumpRankRefresh]);

  return (
    <AgentContextFactoryProvider factory={getAgentContext}>
    <section className="playground-shell" aria-label="Architecture workspace">
      <header className="playground-topbar">
        <p className="playground-topbar__wordmark">Faultline</p>
        <p className="playground-topbar__view-label">
          {viewMode === "logical" ? "Logical architecture" : "World map"}
        </p>
        <div className="playground-topbar__hints">
          {runState === "running" ? (
            <span className="playground-topbar__hint">● running</span>
          ) : null}
          {resultIsStale && runState === "complete" ? (
            <span className="playground-topbar__hint">results stale</span>
          ) : null}
          <span className="playground-topbar__hint">
            {viewMode === "logical"
              ? "delete key removes selected"
              : "edit deployments in inspector"}
          </span>
        </div>
        <div className="playground-topbar__actions">
          <div className="view-mode-toggle" role="group" aria-label="Architecture view">
            <button
              type="button"
              className={viewMode === "logical" ? "view-mode-toggle__button view-mode-toggle__button--active" : "view-mode-toggle__button"}
              aria-pressed={viewMode === "logical"}
              onClick={() => setViewMode("logical")}
            >
              Logical
            </button>
            <button
              type="button"
              className={viewMode === "world" ? "view-mode-toggle__button view-mode-toggle__button--active" : "view-mode-toggle__button"}
              aria-pressed={viewMode === "world"}
              onClick={() => {
                setViewMode("world");
                setWorldSelection(worldSelectionForComponent(architecture, selectedComponentId));
              }}
            >
              World
            </button>
          </div>
        </div>
      </header>

      <div className="playground-body">
        <ComponentPalette definitions={paletteDefinitions} />

        <div
          className="playground-canvas"
          aria-label={viewMode === "logical" ? "Logical architecture canvas" : "World architecture map"}
        >
          {showCanvasEmptyState ? (
            <p className="playground-canvas__empty-hint">
              Drag components from the rail · Connect ports · Press Run
            </p>
          ) : null}
          {viewMode === "logical" ? (
            <ReactFlow
              className="playground-flow"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "ink" }}
              connectionLineComponent={InkConnectionLine}
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
              snapToGrid
              snapGrid={PLAYGROUND_SNAP_GRID}
              panOnScroll
              selectionOnDrag={false}
              panOnDrag={[1, 2]}
              panActivationKeyCode="Space"
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#b8ae9e" />
              <Controls showInteractive={false} className="playground-flow__controls" position="bottom-left" />
            </ReactFlow>
          ) : (
            <WorldMap
              architecture={architecture}
              challenge={activeChallenge}
              selectedComponentId={selectedComponentId}
              selection={worldSelection}
              geographicRoutes={
                showSimulationVisuals && !resultIsStale ? simulationResult?.geographicRoutes ?? [] : []
              }
              routesActive={showSimulationVisuals && !resultIsStale}
              onSelectComponent={(componentId, deploymentId) => {
                setSelectedComponentId(componentId);
                setWorldSelection(
                  deploymentId
                    ? { kind: "deployment", componentId, deploymentId }
                    : worldSelectionForComponent(architecture, componentId),
                );
              }}
              onSelectRegion={(regionId) => {
                setWorldSelection({ kind: "region", regionId });
                const deployed = architecture.components.find((component) =>
                  component.deployments.some((deployment) => deployment.regionId === regionId),
                );
                if (deployed) setSelectedComponentId(deployed.id);
              }}
            />
          )}
        </div>

        <aside className="playground-inspector-column">
          <PlaygroundDataPlates
            expanded={dataPlatesExpanded}
            onToggle={() => setDataPlatesExpanded((current) => !current)}
          >
            <p className="sr-only" aria-live="polite">
              {attentionComponentId ? `AI Engineer is inspecting ${attentionComponentId}.` : ""}
            </p>
            <RequirementsHud result={simulationResult} runState={runState} resultIsStale={resultIsStale} />
            <BudgetHud
              architecture={architecture}
              traffic={showSimulationVisuals && !resultIsStale ? simulationResult?.traffic : undefined}
              geographicRoutes={
                showSimulationVisuals && !resultIsStale ? simulationResult?.geographicRoutes : undefined
              }
            />
            <StartOfficialAttempt />
            <PlayerRankHud />
            <LeaderboardHud />
            <AiEngineerPanel
              architecture={architecture}
              onAttention={setAttentionComponentId}
              onShowOnCanvas={(componentId) => {
                if (viewMode === "logical") fitView({ nodes: [{ id: componentId }], duration: 250, padding: 0.4 });
              }}
            />
          </PlaygroundDataPlates>
          <div className="playground-inspector">
            <ComponentInspector
              architecture={architecture}
              component={selectedComponent}
              onConfigChange={onConfigChange}
              onDeploymentsChange={onDeploymentsChange}
            />
          </div>
        </aside>
      </div>

      <SimulationRunPanel
        runState={runState}
        resultIsStale={resultIsStale}
        errors={simulationErrors}
        unexpectedError={unexpectedError}
        result={simulationResult}
        onRun={onRunSimulation}
        officialActive={officialSession !== null}
        onSubmitOfficial={onSubmitOfficial}
        officialSubmitting={officialSubmitting}
        officialSummary={officialSummary}
      />
    </section>
    </AgentContextFactoryProvider>
  );
}

export function ArchitectureCanvas() {
  return (
    <OfficialAttemptProvider>
      <ReactFlowProvider>
        <ArchitectureWorkspace />
      </ReactFlowProvider>
    </OfficialAttemptProvider>
  );
}
