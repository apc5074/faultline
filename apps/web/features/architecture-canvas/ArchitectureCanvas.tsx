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
  type OnConnectStart,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import { urlShortenerChallenge } from "@faultline/challenges";
import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { LeaderboardHud } from "@/features/leaderboards/LeaderboardHud";
import { PlayerRankHud } from "@/features/leaderboards/PlayerRankHud";
import {
  OfficialAttemptProvider,
  useOfficialAttempt,
} from "@/features/official-attempt/OfficialAttemptContext";
import type { SubmitOfficialResponse } from "@/app/api/submissions/route";
import { componentRegistry } from "@faultline/component-catalog";
import { checkConnectionCompatibility, postgresReplicaDeployments, totalServiceInstancesFromDeployments, type Architecture, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection, type RegionDeployment, type RegionId, type RequirementDefinition, type RequirementResult } from "@faultline/core";
import {
  estimateMonthlyCost,
  evaluateRequirements,
  type RequirementsEvaluationResult,
  type SimulationValidationError,
} from "@faultline/simulator";

import { WorldMap, type WorldMapSelection } from "@/features/world-map/WorldMap";
import { AiEngineerPanel } from "@/features/ai-engineer/AiEngineerPanel";
import { AgentContextFactoryProvider } from "@/features/agent-context/AgentContextFactoryContext";
import { WebMcpRegistration } from "@/features/webmcp/WebMcpRegistration";
import { useLiveAgentContextFactory } from "@/lib/agent-context/use-live-agent-context-factory";
import { ComponentRail } from "@/features/architecture-canvas/ComponentRail";
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
import {
  connectHintForPort,
  nodeHasCompatiblePort,
  type ConnectingFrom,
} from "@/features/architecture-canvas/playground-connect-hints";
import {
  PLAYGROUND_DELETE_MS,
  PLAYGROUND_EDGE_PULSE_MS,
  PLAYGROUND_SETTLE_MS,
  type NodeInteractionPhase,
} from "@/features/architecture-canvas/playground-interaction";
import { RegionEnclosuresLayer } from "@/features/architecture-canvas/RegionEnclosuresLayer";
import { isSemanticZoomOut } from "@/features/architecture-canvas/semantic-zoom";
import {
  applyRegionPlacementFromPosition,
  componentBelongsInEnclosure,
  enclosureRegionsForArchitecture,
} from "@/features/architecture-canvas/region-enclosures";
import { notifyPacketReroute } from "@/features/architecture-canvas/playground-packet-reroute";
import { DataPlateInspector } from "@/features/architecture-canvas/DataPlateInspector";
import { PlaygroundNode, type PlaygroundNodeData } from "@/features/architecture-canvas/PlaygroundNode";
import { glyphDimensionsForProps, glyphPropsFromComponent, MINI_GLYPH_SIZE, type GlyphSimulationResult } from "@/features/playground-glyphs";

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
  interaction: {
    connectingFrom: ConnectingFrom | null;
    settlingNodeIds: ReadonlySet<string>;
    deletingNodeIds: ReadonlySet<string>;
    components: readonly ComponentInstance[];
    isValidConnection: (connection: FlowConnectionLike) => boolean;
    enclosureRegions: readonly RegionId[];
    semanticZoomOut: boolean;
  },
): PlaygroundFlowNode {
  const definition = componentRegistry.get(component.type);
  const glyphCatalog = glyphPropsFromComponent(component, definition);
  const dimensions = glyphDimensionsForProps(glyphCatalog);
  const displayWidth = interaction.semanticZoomOut ? MINI_GLYPH_SIZE : dimensions.width;
  const displayHeight = interaction.semanticZoomOut ? MINI_GLYPH_SIZE : playgroundNodeHeight(dimensions.height);

  const portConnectHints = Object.fromEntries(
    definition.ports.map((port) => [
      port.id,
      connectHintForPort(
        interaction.connectingFrom,
        component.id,
        port.id,
        port.direction,
        interaction.components,
        interaction.isValidConnection,
      ),
    ]),
  );

  const connectDimmed =
    interaction.connectingFrom !== null &&
    !nodeHasCompatiblePort(
      interaction.connectingFrom,
      component.id,
      definition.ports,
      interaction.components,
      interaction.isValidConnection,
    );

  let interactionPhase: NodeInteractionPhase = "idle";
  if (interaction.deletingNodeIds.has(component.id)) interactionPhase = "deleting";
  else if (interaction.settlingNodeIds.has(component.id)) interactionPhase = "settling";

  const regionBelonging =
    interaction.enclosureRegions.length > 0 &&
    componentBelongsInEnclosure(component, dimensions, interaction.enclosureRegions);

  return {
    id: component.id,
    type: "playground",
    position: component.ui,
    width: displayWidth,
    height: displayHeight,
    data: {
      component,
      definition,
      simulation: simulationSnapshot(simulation),
      resultIsStale,
      attention: component.id === attentionComponentId,
      connectedPortIds: connectedPortIdsForComponent(component.id, connections),
      interactionPhase,
      connectDimmed,
      portConnectHints,
      regionBelonging,
      semanticZoomOut: interaction.semanticZoomOut,
    },
    selected: component.id === selectedComponentId,
  };
}

const nodeTypes = { playground: PlaygroundNode };
const edgeTypes = { ink: InkEdge };

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
    pulse: boolean;
    peeling: boolean;
    semanticZoomOut: boolean;
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
      pulse: context.pulse,
      peeling: context.peeling,
      semanticZoomOut: context.semanticZoomOut,
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
  const [connectingFrom, setConnectingFrom] = useState<ConnectingFrom | null>(null);
  const [settlingNodeIds, setSettlingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deletingNodeIds, setDeletingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pulsingEdgeIds, setPulsingEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [semanticZoomOut, setSemanticZoomOut] = useState(false);
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
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

  const isValidConnection = useCallback(
    (connection: FlowConnection | Edge | FlowConnectionLike) => connectionFromFlow(connection, architecture.components) !== null,
    [architecture.components],
  );
  const enclosureRegions = useMemo(
    () => enclosureRegionsForArchitecture(architecture, activeChallenge),
    [architecture],
  );

  const applyRegionalPlacement = useCallback(
    (component: ComponentInstance, position: { x: number; y: number }): ComponentInstance => {
      if (enclosureRegions.length === 0) return component;
      const definition = componentRegistry.get(component.type);
      const glyphCatalog = glyphPropsFromComponent(component, definition);
      const dimensions = glyphDimensionsForProps(glyphCatalog);
      return applyRegionPlacementFromPosition(component, position, dimensions, enclosureRegions);
    },
    [enclosureRegions],
  );

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
          {
            connectingFrom,
            settlingNodeIds,
            deletingNodeIds,
            components: architecture.components,
            isValidConnection,
            enclosureRegions,
            semanticZoomOut,
          },
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
      connectingFrom,
      settlingNodeIds,
      deletingNodeIds,
      isValidConnection,
      enclosureRegions,
      semanticZoomOut,
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
        pulse: pulsingEdgeIds.has(connection.id),
        peeling:
          deletingNodeIds.has(connection.sourceComponentId) ||
          deletingNodeIds.has(connection.targetComponentId),
        semanticZoomOut,
      }),
    );
  }, [
    architecture.connections,
    architecture.components,
    activeConnectionIds,
    showSimulationVisuals,
    resultIsStale,
    simulationResult?.events,
    pulsingEdgeIds,
    deletingNodeIds,
    semanticZoomOut,
  ]);
  const selectedComponent = architecture.components.find((component) => component.id === selectedComponentId);
  const showCanvasEmptyState =
    viewMode === "logical" && architecture.components.length === 1 && architecture.components[0]?.type === "traffic-source";
  useEffect(() => {
    if (attentionComponentId && !architecture.components.some((component) => component.id === attentionComponentId)) {
      setAttentionComponentId(null);
    }
  }, [architecture.components, attentionComponentId]);

  const onNodesChange = useCallback((changes: NodeChange<PlaygroundFlowNode>[]) => {
    const structuralChanges = changes.filter((change) => change.type !== "remove");

    if (structuralChanges.length > 0) {
      setArchitecture((current) => {
        let components = current.components;

        for (const change of structuralChanges) {
          if (change.type === "position") {
            const position = change.position;
            if (!position) continue;
            const snapped = snapPosition(position);
            components = components.map((component) => {
              if (component.id !== change.id) return component;
              const placed = { ...component, ui: snapped };
              if (change.dragging === false) {
                return applyRegionalPlacement(placed, snapped);
              }
              return placed;
            });
          }
        }

        if (components === current.components) return current;
        return { ...current, components };
      });
    }

    for (const change of changes) {
      if (change.type !== "remove") continue;
      if (pendingDeleteIdsRef.current.has(change.id)) continue;

      pendingDeleteIdsRef.current.add(change.id);
      setDeletingNodeIds((current) => new Set(current).add(change.id));

      const connectionIds = architecture.connections
        .filter(
          (connection) =>
            connection.sourceComponentId === change.id || connection.targetComponentId === change.id,
        )
        .map((connection) => connection.id);
      notifyPacketReroute({ componentId: change.id, connectionIds });

      window.setTimeout(() => {
        setArchitecture((current) => {
          const components = current.components.filter((component) => component.id !== change.id);
          const componentIds = new Set(components.map((component) => component.id));
          return {
            ...current,
            components,
            connections: current.connections.filter(
              (connection) =>
                componentIds.has(connection.sourceComponentId) && componentIds.has(connection.targetComponentId),
            ),
          };
        });
        setDeletingNodeIds((current) => {
          const next = new Set(current);
          next.delete(change.id);
          return next;
        });
        pendingDeleteIdsRef.current.delete(change.id);
      }, PLAYGROUND_DELETE_MS);
    }

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
  }, [architecture, selectedComponentId, applyRegionalPlacement]);

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
    const placed = applyRegionalPlacement(component, component.ui);
    setArchitecture((current) => ({ ...current, components: [...current.components, placed] }));
    setSelectedComponentId(placed.id);
    setWorldSelection(null);
    setSettlingNodeIds((current) => new Set(current).add(placed.id));
    window.setTimeout(() => {
      setSettlingNodeIds((current) => {
        const next = new Set(current);
        next.delete(placed.id);
        return next;
      });
    }, PLAYGROUND_SETTLE_MS);
  }, [screenToFlowPosition, applyRegionalPlacement]);

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

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    if (!params.nodeId || !params.handleId || !params.handleType) return;
    setConnectingFrom({
      nodeId: params.nodeId,
      handleId: params.handleId,
      handleType: params.handleType,
    });
  }, []);

  const onConnectEnd = useCallback(() => {
    setConnectingFrom(null);
  }, []);

  const onConnect = useCallback((connection: FlowConnection) => {
    setConnectingFrom(null);
    let createdConnectionId: string | null = null;

    setArchitecture((current) => {
      const canonicalConnection = connectionFromFlow(connection, current.components);
      if (!canonicalConnection) return current;
      const isDuplicate = current.connections.some(
        (existing) =>
          existing.sourceComponentId === canonicalConnection.sourceComponentId &&
          existing.sourcePortId === canonicalConnection.sourcePortId &&
          existing.targetComponentId === canonicalConnection.targetComponentId &&
          existing.targetPortId === canonicalConnection.targetPortId &&
          existing.type === canonicalConnection.type,
      );
      if (isDuplicate) return current;
      createdConnectionId = canonicalConnection.id;
      return { ...current, connections: [...current.connections, canonicalConnection] };
    });

    if (!createdConnectionId) return;

    const pulseConnectionId = createdConnectionId;
    setPulsingEdgeIds((current) => new Set(current).add(pulseConnectionId));
    window.setTimeout(() => {
      setPulsingEdgeIds((current) => {
        const next = new Set(current);
        next.delete(pulseConnectionId);
        return next;
      });
    }, PLAYGROUND_EDGE_PULSE_MS);
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
      <WebMcpRegistration challengeKey={activeChallenge.slug} />
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
        <ComponentRail definitions={paletteDefinitions} />

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
              className={semanticZoomOut ? "playground-flow playground-flow--semantic-out" : "playground-flow"}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "ink" }}
              connectionLineComponent={InkConnectionLine}
              onNodesChange={onNodesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onEdgesChange={onEdgesChange}
              isValidConnection={isValidConnection}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onInit={(instance) => {
                setSemanticZoomOut(isSemanticZoomOut(instance.getZoom()));
              }}
              onMove={(_event, viewport) => {
                setSemanticZoomOut((current) => {
                  const next = isSemanticZoomOut(viewport.zoom);
                  return current === next ? current : next;
                });
              }}
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
              <RegionEnclosuresLayer regionIds={enclosureRegions} semanticZoomOut={semanticZoomOut} />
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
            <DataPlateInspector
              architecture={architecture}
              component={selectedComponent}
              simulation={simulationResult}
              simulationStale={resultIsStale}
              runComplete={runState === "complete"}
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
