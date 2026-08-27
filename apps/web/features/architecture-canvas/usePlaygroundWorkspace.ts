"use client";

import { useReactFlow, type Connection as FlowConnection, type Edge, type EdgeChange, type NodeChange } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { architectureAvailabilityFingerprint } from "@faultline/agent-capabilities";
import type { SubmitOfficialResponse } from "@/app/api/submissions/route";
import { componentRegistry } from "@faultline/component-catalog";
import { postgresReplicaDeployments, totalServiceInstancesFromDeployments, type Architecture, type ComponentInstance, type RegionDeployment, type RegionId } from "@faultline/core";
import { evaluateRequirements, type SimulationValidationError } from "@faultline/simulator";

import { clampToPlaygroundBoard } from "@/features/architecture-canvas/canvas-grid";
import {
  buildEdgePathsFromArchitecture,
  computeHopMarkers,
  computeParallelOffsets,
  connectionLoadFromEvents,
  normalizeConnectionLoad,
} from "@/features/architecture-canvas/ink-edge-routing";
import { buildLevel1HeroScene } from "@/features/architecture-canvas/level1-hero-scene";
import { activeChallenge } from "@/features/architecture-canvas/playground-challenge";
import {
  architectureSimulationKey,
  connectionFromFlow,
  createComponentInstance,
  formatCost,
  resolveInitialArchitecture,
  worldSelectionForComponent,
} from "@/features/architecture-canvas/playground-architecture-utils";
import type { ConnectingFrom } from "@/features/architecture-canvas/playground-connect-hints";
import { componentToNode, connectionToEdge } from "@/features/architecture-canvas/playground-flow-model";
import {
  PLAYGROUND_DELETE_MS,
  PLAYGROUND_EDGE_PULSE_MS,
  PLAYGROUND_SETTLE_MS,
} from "@/features/architecture-canvas/playground-interaction";
import { notifyPacketReroute, registerPacketRerouteHandler } from "@/features/architecture-canvas/playground-packet-reroute";
import type { FlowConnectionLike, PlaygroundFlowNode, SimulationRunState, SuccessfulSimulation } from "@/features/architecture-canvas/playground-types";
import {
  applyRegionPlacementFromPosition,
  enclosureRegionsForArchitecture,
} from "@/features/architecture-canvas/region-enclosures";
import { glyphDimensionsForProps, glyphPropsFromComponent } from "@/features/playground-glyphs";
import { usePlaybackController, type ComponentPlaybackVisual } from "@/features/traffic-playback";
import type { WorldMapSelection } from "@/features/world-map/WorldMap";
import { useOfficialAttempt } from "@/features/official-attempt/OfficialAttemptContext";

export function usePlaygroundWorkspace() {
  const { session: officialSession, bumpRankRefresh } = useOfficialAttempt();
  const [architecture, setArchitecture] = useState<Architecture>(resolveInitialArchitecture);
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
  const [connectingFrom, setConnectingFrom] = useState<ConnectingFrom | null>(null);
  const [settlingNodeIds, setSettlingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deletingNodeIds, setDeletingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pulsingEdgeIds, setPulsingEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [semanticZoomOut, setSemanticZoomOut] = useState(false);
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const playback = usePlaybackController();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const paletteDefinitions = useMemo(
    () => componentRegistry.list().filter((definition) => activeChallenge.allowedComponentTypes.includes(definition.type)),
    [],
  );
  const webMcpReconciliationKey = useMemo(
    () => `${activeChallenge.slug}:${architectureAvailabilityFingerprint(architecture)}`,
    [architecture],
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

  const isValidConnection = useCallback(
    (connection: FlowConnection | Edge | FlowConnectionLike) =>
      connectionFromFlow(connection, architecture.components) !== null,
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

  const playbackVisualsActive = playback.playbackRunning;
  const playbackVisualByComponent = useMemo(() => {
    const map = new Map<string, ComponentPlaybackVisual>();
    if (!playbackVisualsActive) return map;
    for (const visual of playback.frame.componentVisuals) {
      map.set(visual.componentId, visual);
    }
    return map;
  }, [playback.frame.componentVisuals, playbackVisualsActive]);

  const idlePlaybackVisual = useCallback(
    (componentId: string): ComponentPlaybackVisual => ({
      componentId,
      processingCount: 0,
      state: "idle",
    }),
    [],
  );
  const playbackEdgeLoads = useMemo(() => {
    const map = new Map<string, number>();
    if (!playbackVisualsActive) return map;
    for (const edgeLoad of playback.frame.edgeLoads) {
      map.set(edgeLoad.connectionId, edgeLoad.weight);
    }
    return map;
  }, [playback.frame.edgeLoads, playbackVisualsActive]);

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
          playbackVisualByComponent.get(component.id) ??
            (playbackVisualsActive ? idlePlaybackVisual(component.id) : undefined),
          playbackVisualsActive,
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
      playbackVisualByComponent,
      playbackVisualsActive,
      idlePlaybackVisual,
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
        trafficActive: showSimulationVisuals || playbackVisualsActive,
        resultIsStale,
        load: normalizeConnectionLoad(loads.get(connection.id) ?? 0, maxLoad),
        playbackLoad: playbackEdgeLoads.get(connection.id) ?? 0,
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
    playbackVisualsActive,
    resultIsStale,
    simulationResult?.events,
    pulsingEdgeIds,
    deletingNodeIds,
    semanticZoomOut,
    playbackEdgeLoads,
  ]);

  const selectedComponent = architecture.components.find((component) => component.id === selectedComponentId);
  const showCanvasEmptyState = false;

  useEffect(() => {
    if (attentionComponentId && !architecture.components.some((component) => component.id === attentionComponentId)) {
      setAttentionComponentId(null);
    }
  }, [architecture.components, attentionComponentId]);

  const onNodesChange = useCallback(
    (changes: NodeChange<PlaygroundFlowNode>[]) => {
      const structuralChanges = changes.filter((change) => change.type !== "remove");

      if (structuralChanges.length > 0) {
        setArchitecture((current) => {
          let components = current.components;

          for (const change of structuralChanges) {
            if (change.type === "position") {
              const position = change.position;
              if (!position) continue;
              const snapped = clampToPlaygroundBoard(position);
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

      const selectChanges = changes.filter((change) => change.type === "select");
      if (selectChanges.length > 0) {
        // React Flow emits deselect+select in one batch; prefer the newly selected node
        // so switching components does not briefly clear into the challenge sidebar.
        const newlySelected = selectChanges.find((change) => change.selected);
        const nextId = newlySelected ? newlySelected.id : null;
        setSelectedComponentId(nextId);
        setWorldSelection(worldSelectionForComponent(architecture, nextId));
      }
      for (const change of changes) {
        if (change.type === "remove" && change.id === selectedComponentId) {
          setSelectedComponentId(null);
          setWorldSelection(null);
        }
      }
    },
    [architecture, selectedComponentId, applyRegionalPlacement],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/faultline-component-type");
      if (!activeChallenge.allowedComponentTypes.includes(type) || !componentRegistry.has(type)) return;

      const component = createComponentInstance(
        componentRegistry.get(type),
        clampToPlaygroundBoard(screenToFlowPosition({ x: event.clientX, y: event.clientY })),
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
    },
    [screenToFlowPosition, applyRegionalPlacement],
  );

  const onConfigChange = useCallback((componentId: string, config: unknown) => {
    setArchitecture((current) => {
      const component = current.components.find((candidate) => candidate.id === componentId);
      if (!component) return current;
      const parsed = componentRegistry.get(component.type).configSchema.safeParse(config);
      if (!parsed.success) return current;
      return {
        ...current,
        components: current.components.map((candidate) =>
          candidate.id === componentId ? { ...candidate, config: parsed.data } : candidate,
        ),
      };
    });
  }, []);

  const onDeploymentsChange = useCallback((componentId: string, deployments: RegionDeployment[]) => {
    setArchitecture((current) => {
      const component = current.components.find((candidate) => candidate.id === componentId);
      if (!component || !componentRegistry.has(component.type)) return current;

      let nextConfig = component.config;
      if (component.type === "service") {
        if (deployments.length > 0) {
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

  const onConnectStart = useCallback((_event: unknown, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
    if (!params.nodeId || !params.handleId || !params.handleType) return;
    setConnectingFrom({
      nodeId: params.nodeId,
      handleId: params.handleId,
      handleType: params.handleType as ConnectingFrom["handleType"],
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

  useEffect(() => {
    registerPacketRerouteHandler(({ componentId }) => {
      playback.markComponentFailed(componentId);
    });
    return () => registerPacketRerouteHandler(null);
  }, [playback.markComponentFailed]);

  useEffect(() => {
    playback.syncArchitecture(architecture);
  }, [architecture, playback.syncArchitecture]);

  const handleSimBarRun = useCallback(() => {
    if (playback.playbackPaused) {
      playback.resume();
      return;
    }
    if (playback.phase === "idle") {
      playback.start(architecture);
    }
    if (runState !== "running") {
      onRunSimulation();
    }
  }, [architecture, onRunSimulation, playback, runState]);

  const handleSimBarReset = useCallback(() => {
    playback.reset();
    setSimulationResult(null);
    setSimulationErrors([]);
    setUnexpectedError(null);
    setOfficialSummary(null);
    setRunState("idle");
  }, [playback]);

  const handleViewModeChange = useCallback(
    (mode: "logical" | "world") => {
      setViewMode(mode);
      if (mode === "world") {
        setWorldSelection(worldSelectionForComponent(architecture, selectedComponentId));
      }
    },
    [architecture, selectedComponentId],
  );

  const loadHeroScene = useCallback(() => {
    playback.reset();
    setSelectedComponentId(null);
    setAttentionComponentId(null);
    setWorldSelection(null);
    setSimulationResult(null);
    setSimulationErrors([]);
    setUnexpectedError(null);
    setOfficialSummary(null);
    setRunState("idle");
    setLastRunKey(null);
    setArchitecture(buildLevel1HeroScene());
  }, [playback]);

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
        if (playback.phase === "idle") {
          playback.start(architecture);
        }

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
  }, [architecture, officialSession, bumpRankRefresh, playback]);

  const onSelectComponent = useCallback(
    (componentId: string, deploymentId?: string) => {
      setSelectedComponentId(componentId);
      setWorldSelection(
        deploymentId
          ? { kind: "deployment", componentId, deploymentId }
          : worldSelectionForComponent(architecture, componentId),
      );
    },
    [architecture],
  );

  const onSelectRegion = useCallback(
    (regionId: RegionId) => {
      setWorldSelection({ kind: "region", regionId });
      const deployed = architecture.components.find((component) =>
        component.deployments.some((deployment) => deployment.regionId === regionId),
      );
      if (deployed) setSelectedComponentId(deployed.id);
    },
    [architecture],
  );

  const focusComponentOnCanvas = useCallback(
    (componentId: string) => {
      if (viewMode === "logical") fitView({ nodes: [{ id: componentId }], duration: 250, padding: 0.4 });
    },
    [fitView, viewMode],
  );

  return {
    architecture,
    paletteDefinitions,
    webMcpReconciliationKey,
    selectedComponent,
    selectedComponentId,
    attentionComponentId,
    setAttentionComponentId,
    viewMode,
    worldSelection,
    runState,
    simulationResult,
    simulationErrors,
    unexpectedError,
    resultIsStale,
    showSimulationVisuals,
    officialSubmitting,
    officialSummary,
    officialSession,
    semanticZoomOut,
    setSemanticZoomOut,
    nodes,
    edges,
    enclosureRegions,
    showCanvasEmptyState,
    playback,
    onNodesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onEdgesChange,
    isValidConnection,
    onDragOver,
    onDrop,
    onConfigChange,
    onDeploymentsChange,
    handleSimBarRun,
    handleSimBarReset,
    handleViewModeChange,
    loadHeroScene,
    onSubmitOfficial,
    onSelectComponent,
    onSelectRegion,
    focusComponentOnCanvas,
  };
}
