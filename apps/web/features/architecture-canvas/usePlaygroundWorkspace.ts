"use client";

import { useReactFlow, type Connection as FlowConnection, type Edge, type EdgeChange, type NodeChange } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { architectureAvailabilityFingerprint, type PinnedObservation, type PresentationCue } from "@faultline/agent-capabilities";
import type { SubmitOfficialResponse } from "@/app/api/submissions/route";
import type { StartAttemptResponse } from "@/app/api/attempts/start/route";
import { componentRegistry } from "@faultline/component-catalog";
import { postgresReplicaDeployments, totalServiceInstancesFromDeployments, type Architecture, type ComponentInstance, type ExperimentResult, type RegionDeployment, type RegionId } from "@faultline/core";
import { evaluateRequirements, type SimulationValidationError } from "@faultline/simulator";

import { clampToPlaygroundBoard } from "@/features/architecture-canvas/canvas-grid";
import { runDurationMs } from "@/features/architecture-canvas/run-duration";
import { firstFailureFocus } from "@/features/architecture-canvas/run-failure-focus";
import { buildRunTimeline, firstFailingComponentId } from "@/features/architecture-canvas/run-timeline";
import {
  buildEdgePathsFromArchitecture,
  computeHopMarkers,
  computeParallelOffsets,
  connectionLoadFromEvents,
  normalizeConnectionLoad,
} from "@/features/architecture-canvas/ink-edge-routing";
import { buildLevel1HeroScene } from "@/features/architecture-canvas/level1-hero-scene";
import { activeChallenge, challengeRedirectRps } from "@/features/architecture-canvas/playground-challenge";
import {
  architectureSimulationKey,
  connectionCreateResult,
  createDroppedComponentInstance,
  formatCost,
  reconnectAroundComponent,
  resolveInitialArchitecture,
  loadPersistedArchitecture,
  persistArchitecture,
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
import {
  buildComponentPlaybackVisuals,
  buildComponentVolumeShares,
  edgePlaybackWeightFromRps,
  edgeRatesFromTrafficEvents,
  usePlaybackController,
  type ComponentPlaybackVisual,
} from "@/features/traffic-playback";
import type { WorldMapSelection } from "@/features/world-map/WorldMap";
import { useOfficialAttempt } from "@/features/official-attempt/OfficialAttemptContext";

export function usePlaygroundWorkspace() {
  const {
    session: officialSession,
    completion,
    setSession,
    setCompletion,
    bumpRankRefresh,
  } = useOfficialAttempt();
  const [architecture, setArchitecture] = useState<Architecture>(resolveInitialArchitecture);
  const draftHydratedRef = useRef(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [attentionComponentId, setAttentionComponentId] = useState<string | null>(null);
  const [attentionComponentIds, setAttentionComponentIds] = useState<ReadonlySet<string>>(() => new Set());
  const [attentionConnectionIds, setAttentionConnectionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [attentionPrimaryConnectionId, setAttentionPrimaryConnectionId] = useState<string | null>(null);
  const attentionTimeoutRef = useRef<number | null>(null);
  const canvasInteractionRef = useRef(false);
  const presentationVersionRef = useRef(0);
  const pendingCameraRef = useRef<{ readonly version: number; readonly componentIds: readonly string[] } | null>(null);
  const [viewMode, setViewMode] = useState<"logical" | "world">("logical");
  const [worldSelection, setWorldSelection] = useState<WorldMapSelection>(null);
  const [pinnedObservations, setPinnedObservations] = useState<readonly PinnedObservation[]>([]);
  const [runState, setRunState] = useState<SimulationRunState>("idle");
  const [simulationResult, setSimulationResult] = useState<SuccessfulSimulation | null>(null);
  const [simulationErrors, setSimulationErrors] = useState<readonly SimulationValidationError[]>([]);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const [officialSubmitting, setOfficialSubmitting] = useState(false);
  const [officialSummary, setOfficialSummary] = useState<string | null>(null);
  const [officialVerification, setOfficialVerification] = useState<Extract<SubmitOfficialResponse, { ok: true }> | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<ConnectingFrom | null>(null);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const [settlingNodeIds, setSettlingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deletingNodeIds, setDeletingNodeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pulsingEdgeIds, setPulsingEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [semanticZoomOut, setSemanticZoomOut] = useState(false);
  const [experimentPresentation, setExperimentPresentation] = useState<ExperimentResult | null>(null);
  const [requirementsReviewKey, setRequirementsReviewKey] = useState(0);
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const rejectedNodeDeleteIdsRef = useRef<Set<string>>(new Set());
  const playback = usePlaybackController();
  const { screenToFlowPosition, fitView } = useReactFlow();

  useEffect(() => {
    if (!completion?.submission) return;
    setOfficialVerification(completion.submission);
    setOfficialSummary(null);
  }, [completion]);

  useEffect(() => {
    const persisted = loadPersistedArchitecture();
    if (persisted) setArchitecture(persisted);
    draftHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (draftHydratedRef.current) persistArchitecture(architecture);
  }, [architecture]);

  const paletteDefinitions = useMemo(
    () => componentRegistry.list().filter((definition) => activeChallenge.allowedComponentTypes.includes(definition.type)),
    [],
  );
  const webMcpReconciliationKey = useMemo(
    () => `${activeChallenge.slug}:${architectureAvailabilityFingerprint(architecture)}`,
    [architecture],
  );
  const simulationKey = useMemo(() => architectureSimulationKey(architecture), [architecture]);
  const rawResultIsStale = lastRunKey !== null && lastRunKey !== simulationKey;
  // The prior result stays available after an edit, and becomes stale as soon
  // as the editable board no longer matches the run that produced it.
  const resultIsStale = rawResultIsStale && runState === "complete";
  // A completed run remains available as evidence, but the canvas itself
  // returns to a clean editable state after the playback reset.
  const showSimulationVisuals = simulationResult !== null && runState === "complete";
  // Keep retained run evidence visible on the board after an edit. The stale
  // marker belongs to the status surfaces, not to the editable canvas styling.
  const boardEvidenceIsStale = false;
  const presentationEvents = experimentPresentation?.events ?? simulationResult?.events;
  const activeConnectionIds = useMemo(() => {
    if (!presentationEvents) return new Set<string>();
    return new Set(
      presentationEvents
        .filter((event) => event.type === "traffic_routed" && event.connectionId)
        .map((event) => event.connectionId as string),
    );
  }, [presentationEvents]);

  const isValidConnection = useCallback(
    (connection: FlowConnection | Edge | FlowConnectionLike) =>
      connectionCreateResult(connection, architecture).ok,
    [architecture],
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

  // Retriggers the traffic-source starting pulse each time a run begins.
  const runPulseKey = playbackVisualsActive ? `run-${playback.runSeq}` : undefined;

  const culpritComponentId = useMemo(() => {
    if (runState !== "complete") return null;
    return firstFailingComponentId(presentationEvents ?? []);
  }, [presentationEvents, runState]);

  const shareBasedPlaybackVisuals = useMemo(() => {
    if (!playbackVisualsActive || !simulationResult) return null;
    const totalEvents = Math.max(1, simulationResult.events.length);
    const tick = Math.max(0, playback.frame.tick);
    return buildComponentPlaybackVisuals(
      {
        runId: `run-${lastRunKey ?? "live"}`,
        architecture,
        components: architecture.components,
        simulation: {
          services: simulationResult.services,
          postgres: simulationResult.postgres,
          caches: simulationResult.caches,
          events: simulationResult.events,
          hotKey: simulationResult.hotKey,
        },
        redirectRps: challengeRedirectRps,
      },
      Math.min(tick, totalEvents),
      totalEvents,
    );
  }, [
    playbackVisualsActive,
    simulationResult,
    experimentPresentation,
    playback.frame.tick,
    architecture,
    lastRunKey,
  ]);

  const playbackVisualByComponent = useMemo(() => {
    const map = new Map<string, ComponentPlaybackVisual>();
    if (!playbackVisualsActive) return map;
    if (shareBasedPlaybackVisuals) {
      for (const visual of shareBasedPlaybackVisuals) {
        map.set(visual.componentId, visual);
      }
      // A simulator-emitted experiment failure is stronger evidence than the
      // baseline-derived share visual for that component.
      for (const visual of playback.frame.componentVisuals) {
        if (visual.state === "failed") {
          map.set(visual.componentId, visual);
          continue;
        }
        if (visual.state === "processing" || visual.processingCount > 0 || visual.cacheHitFlash || (visual.rejectedCount ?? 0) > 0) {
          const settled = map.get(visual.componentId);
          // Live packet dwell owns the animated mechanism count. The settled
          // path-share fill returns when the component is no longer processing.
          map.set(visual.componentId, {
            ...settled,
            ...visual,
            evidenceLabel: settled?.evidenceLabel,
          });
        }
      }
      return map;
    }
    for (const visual of playback.frame.componentVisuals) {
      map.set(visual.componentId, visual);
    }
    return map;
  }, [playback.frame.componentVisuals, playbackVisualsActive, shareBasedPlaybackVisuals]);

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
          boardEvidenceIsStale,
          attentionComponentIds,
          attentionComponentId,
          playbackVisualByComponent.get(component.id) ??
            (playbackVisualsActive ? idlePlaybackVisual(component.id) : undefined),
          playbackVisualsActive,
          runPulseKey,
          culpritComponentId === component.id,
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
      boardEvidenceIsStale,
      attentionComponentIds,
      attentionComponentId,
      connectingFrom,
      settlingNodeIds,
      deletingNodeIds,
      isValidConnection,
      enclosureRegions,
      semanticZoomOut,
      playbackVisualByComponent,
      playbackVisualsActive,
      runPulseKey,
      culpritComponentId,
      idlePlaybackVisual,
    ],
  );

  const edges = useMemo(() => {
    const loads = connectionLoadFromEvents(presentationEvents);
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
    const hasShareEvidence = Boolean(simulationResult && showSimulationVisuals);

    return architecture.connections.map((connection) => {
      const simRps = loads.get(connection.id) ?? 0;
      const shareEdgeLoad = hasShareEvidence
        ? edgePlaybackWeightFromRps(simRps, challengeRedirectRps)
        : normalizeConnectionLoad(simRps, maxLoad);
      // Prefer sim path-share weights once evidence exists so ambient tick packets
      // cannot make Redis look as busy as CDN.
      const tickLoad = hasShareEvidence ? 0 : (playbackEdgeLoads.get(connection.id) ?? 0);

      return connectionToEdge(connection, {
        selected: connection.id === selectedConnectionId,
        deletable: !playbackVisualsActive,
        activeConnectionIds,
        attentionConnectionIds,
        attentionPrimaryConnectionId,
        trafficActive: showSimulationVisuals || playbackVisualsActive,
        resultIsStale: boardEvidenceIsStale,
        load: shareEdgeLoad,
        playbackLoad: tickLoad,
        offset: offsets.get(connection.id) ?? 0,
        hops: hopMap.get(connection.id) ?? [],
        pulse: pulsingEdgeIds.has(connection.id),
        peeling:
          deletingNodeIds.has(connection.sourceComponentId) ||
          deletingNodeIds.has(connection.targetComponentId),
        semanticZoomOut,
      });
    });
  }, [
    architecture.connections,
    architecture.components,
    activeConnectionIds,
    attentionConnectionIds,
    attentionPrimaryConnectionId,
    selectedConnectionId,
    showSimulationVisuals,
    playbackVisualsActive,
    boardEvidenceIsStale,
    simulationResult,
    presentationEvents,
    pulsingEdgeIds,
    deletingNodeIds,
    semanticZoomOut,
    playbackEdgeLoads,
  ]);

  const selectedComponent = architecture.components.find((component) => component.id === selectedComponentId);
  const showCanvasEmptyState = architecture.components.length === 0;

  useEffect(() => {
    if (attentionComponentId && !architecture.components.some((component) => component.id === attentionComponentId)) {
      setAttentionComponentId(null);
    }
  }, [architecture.components, attentionComponentId]);

  useEffect(() => {
    if (selectedConnectionId && !architecture.connections.some((connection) => connection.id === selectedConnectionId)) {
      setSelectedConnectionId(null);
    }
  }, [architecture.connections, selectedConnectionId]);

  useEffect(() => {
    if (!interactionNotice) return;
    const timeoutId = window.setTimeout(() => setInteractionNotice(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [interactionNotice]);

  const onNodesChange = useCallback(
    (changes: NodeChange<PlaygroundFlowNode>[]) => {
      if (changes.some((change) => change.type === "position" || change.type === "select")) {
        if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
        attentionTimeoutRef.current = null;
        setAttentionComponentId(null);
      }
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

        const removedComponent = architecture.components.find((component) => component.id === change.id);
        if (removedComponent?.type === "traffic-source") {
          rejectedNodeDeleteIdsRef.current.add(change.id);
          window.setTimeout(() => rejectedNodeDeleteIdsRef.current.delete(change.id), 0);
          setInteractionNotice("The traffic source can't be deleted.");
          continue;
        }

        pendingDeleteIdsRef.current.add(change.id);
        setDeletingNodeIds((current) => new Set(current).add(change.id));

        const connectionIds = architecture.connections
          .filter(
            (connection) =>
              connection.sourceComponentId === change.id || connection.targetComponentId === change.id,
          )
          .map((connection) => connection.id);
        const connectionsBeforeDelete = architecture.connections;
        notifyPacketReroute({ componentId: change.id, connectionIds });

        window.setTimeout(() => {
          setArchitecture((current) => {
            const components = current.components.filter((component) => component.id !== change.id);
            const componentIds = new Set(components.map((component) => component.id));
            const connections = current.connections.filter(
              (connection) =>
                componentIds.has(connection.sourceComponentId) && componentIds.has(connection.targetComponentId),
            );
            const replacements = reconnectAroundComponent(
              { ...current, components, connections },
              change.id,
              connectionsBeforeDelete,
            );
            return {
              ...current,
              components,
              connections: [...connections, ...replacements],
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
        setSelectedConnectionId(null);
        setWorldSelection(worldSelectionForComponent(architecture, nextId));
      }
      for (const change of changes) {
        if (change.type !== "remove" || change.id !== selectedComponentId) continue;
        const component = architecture.components.find((candidate) => candidate.id === change.id);
        if (component?.type === "traffic-source") continue;
        setSelectedComponentId(null);
        setWorldSelection(null);
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

      const position = clampToPlaygroundBoard(
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
      let created: ComponentInstance | null = null;
      setArchitecture((current) => {
        created = createDroppedComponentInstance(
          componentRegistry.get(type),
          position,
          current.components.map((component) => component.id),
        );
        return { ...current, components: [...current.components, created] };
      });
      // TypeScript cannot observe assignments made inside the state updater;
      // the assertion reflects the runtime guarantee of the updater above.
      const component = created as ComponentInstance | null;
      if (!component) return;
      setSelectedComponentId(component.id);
      setWorldSelection(null);
      setSettlingNodeIds((current) => new Set(current).add(component.id));
      window.setTimeout(() => {
        setSettlingNodeIds((current) => {
          const next = new Set(current);
          next.delete(component.id);
          return next;
        });
      }, PLAYGROUND_SETTLE_MS);
    },
    [screenToFlowPosition],
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
        const instances = Math.max(1, totalServiceInstancesFromDeployments(deployments));
        const parsed = componentRegistry.get(component.type).configSchema.safeParse({
          ...component.config,
          instances,
        });
        if (!parsed.success) return current;
        nextConfig = parsed.data;
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

  const clearConnectingFrom = useCallback(() => {
    setConnectingFrom(null);
  }, []);

  const pulseConnection = useCallback((connectionId: string) => {
    setPulsingEdgeIds((current) => new Set(current).add(connectionId));
    window.setTimeout(() => {
      setPulsingEdgeIds((current) => {
        const next = new Set(current);
        next.delete(connectionId);
        return next;
      });
    }, PLAYGROUND_EDGE_PULSE_MS);
  }, []);

  const onConnectStart = useCallback((_event: unknown, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
    if (!params.nodeId || !params.handleId || !params.handleType) return;
    setInteractionNotice(null);
    setConnectingFrom({
      nodeId: params.nodeId,
      handleId: params.handleId,
      handleType: params.handleType as ConnectingFrom["handleType"],
    });
  }, []);

  const onConnectEnd = useCallback(() => {
    clearConnectingFrom();
  }, [clearConnectingFrom]);

  const onConnect = useCallback((connection: FlowConnection) => {
    clearConnectingFrom();

    setArchitecture((current) => {
      const result = connectionCreateResult(connection, current);
      if (!result.ok) {
        queueMicrotask(() => setInteractionNotice(result.reason));
        return current;
      }

      queueMicrotask(() => {
        setInteractionNotice(null);
        pulseConnection(result.connection.id);
      });
      return { ...current, connections: [...current.connections, result.connection] };
    });
  }, [clearConnectingFrom, pulseConnection]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((change) => change.type === "select" || change.type === "remove")) {
        if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
        attentionTimeoutRef.current = null;
        setAttentionComponentId(null);
      }
      const selectedChanges = changes.filter((change) => change.type === "select");
      if (selectedChanges.length > 0) {
        const newlySelected = selectedChanges.find((change) => change.selected);
        if (newlySelected) {
          setSelectedConnectionId(newlySelected.id);
          setSelectedComponentId(null);
          setWorldSelection(null);
        } else if (selectedChanges.every((change) => !change.selected)) {
          setSelectedConnectionId(null);
        }
      }

      if (playback.playbackRunning) return;

      const removedIds = new Set(
        changes
          .filter((change) => change.type === "remove")
          .filter((change) => {
            const connection = architecture.connections.find((candidate) => candidate.id === change.id);
            return !connection || ![connection.sourceComponentId, connection.targetComponentId].some((componentId) =>
              rejectedNodeDeleteIdsRef.current.has(componentId),
            );
          })
          .map((change) => change.id),
      );
      if (removedIds.size === 0) return;

      setArchitecture((current) => ({
        ...current,
        connections: current.connections.filter((connection) => !removedIds.has(connection.id)),
      }));
      setSelectedConnectionId((current) => (current && removedIds.has(current) ? null : current));
    },
    [architecture.connections, playback.playbackRunning],
  );

  const onRunSimulation = useCallback(() => {
    const runKey = architectureSimulationKey(architecture);
    setRunState("running");
    setSimulationResult(null);
    setUnexpectedError(null);
    setOfficialVerification(null);
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
        const durationMs = runDurationMs(outcome);
        playback.startTimed(
          architecture,
          durationMs,
          buildRunTimeline(outcome.events, durationMs),
          () => {
            playback.reset();
            setRunState("complete");
          },
          (event) => {
            if (event.type === "component_saturated" && event.componentId) playback.markComponentFailed(event.componentId);
          },
        );
      } catch (error) {
        setSimulationResult(null);
        setSimulationErrors([]);
        setLastRunKey(runKey);
        setUnexpectedError(error instanceof Error ? error.message : "Simulation failed unexpectedly.");
        setRunState("error");
      }
    }, 0);
  }, [architecture, playback.reset, playback.startTimed]);

  useEffect(() => {
    registerPacketRerouteHandler(({ componentId }) => {
      playback.markComponentFailed(componentId);
    });
    return () => registerPacketRerouteHandler(null);
  }, [playback.markComponentFailed]);

  useEffect(() => {
    playback.syncArchitecture(architecture);
  }, [architecture, playback.syncArchitecture]);

  useEffect(() => {
    if (!simulationResult || !playback.playbackRunning || resultIsStale) {
      playback.setVolumeShares(null);
      playback.setAuthoritativeTraffic(null);
      return;
    }
    const shares = buildComponentVolumeShares({
      redirectRps: challengeRedirectRps,
      simulation: {
        caches: simulationResult.caches,
        services: simulationResult.services,
        postgres: simulationResult.postgres,
        hotKey: simulationResult.hotKey,
      },
      volumeProfile: undefined,
    });
    const shareMap = new Map<string, number>();
    for (const [id, share] of shares) {
      shareMap.set(id, share.share01);
    }
    playback.setVolumeShares(shareMap);
    const componentActivityRates = new Map<string, number>();
    for (const [componentId, cache] of Object.entries(simulationResult.caches ?? {})) {
      // Placement + configuration resolve to this realized rate in the simulator.
      componentActivityRates.set(componentId, cache.hitRate);
    }
    for (const [componentId, service] of Object.entries(simulationResult.services)) {
      componentActivityRates.set(
        componentId,
        service.incomingRps > 0 ? service.handledRps / service.incomingRps : 0,
      );
    }
    for (const componentId of Object.keys(simulationResult.postgres)) {
      // Postgres intentionally remains a settled pressure-hash visual.
      componentActivityRates.set(componentId, 0);
    }
    playback.setAuthoritativeTraffic({
      rates: edgeRatesFromTrafficEvents(experimentPresentation?.events ?? simulationResult.events),
      redirectRps: challengeRedirectRps,
      componentActivityRates,
    });
  }, [
    simulationResult,
    playback.playbackRunning,
    playback.setVolumeShares,
    playback.setAuthoritativeTraffic,
    resultIsStale,
    experimentPresentation,
  ]);

  useEffect(() => {
    if (!experimentPresentation || !playback.playbackRunning) return;
    for (const event of experimentPresentation.events) {
      if (event.type === "component_failed" && event.componentId) {
        playback.markComponentFailed(event.componentId);
      }
    }
  }, [experimentPresentation, playback.markComponentFailed, playback.playbackRunning]);

  const presentExperiment = useCallback((result: ExperimentResult) => {
    setExperimentPresentation(result);
    playback.start(architecture);
  }, [architecture, playback.start]);

  const clearExperimentPresentation = useCallback(() => {
    setExperimentPresentation(null);
  }, []);

  const handleSimBarRun = useCallback(() => {
    setExperimentPresentation(null);
    if (playback.playbackPaused) {
      playback.resume();
      return;
    }
    if (runState !== "running") {
      onRunSimulation();
    }
  }, [architecture, clearExperimentPresentation, onRunSimulation, playback, runState]);

  const handleSimBarReset = useCallback(() => {
    playback.reset();
    clearExperimentPresentation();
    setSimulationResult(null);
    setSimulationErrors([]);
    setUnexpectedError(null);
    setOfficialSummary(null);
    setOfficialVerification(null);
    setRunState("idle");
  }, [clearExperimentPresentation, playback]);

  const handleSimBarStep = useCallback(() => {
    playback.step(architecture);
  }, [architecture, playback]);

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
    setSelectedConnectionId(null);
    setAttentionComponentId(null);
    setWorldSelection(null);
    setSimulationResult(null);
    setSimulationErrors([]);
    setUnexpectedError(null);
    setOfficialSummary(null);
    setOfficialVerification(null);
    setRunState("idle");
    setLastRunKey(null);
    setArchitecture(buildLevel1HeroScene());
  }, [playback]);

  const startOfficialAttemptFromBriefing = useCallback(() => {
    if (officialSession) return;

    void (async () => {
      try {
        const response = await fetch("/api/attempts/start", {
          method: "POST",
          cache: "no-store",
        });
        const body = (await response.json()) as StartAttemptResponse;
        if (!body.ok) return;
        setSession({
          attemptId: body.attemptId,
          challengeVersion: body.challengeVersion,
          alias: body.alias,
          startedAt: body.startedAt,
        });
      } catch {
        // The visible Start Attempt control remains available as a retry.
      }
    })();
  }, [officialSession, setSession]);

  const onSubmitOfficial = useCallback(() => {
    if (!officialSession) return;
    const runKey = architectureSimulationKey(architecture);
    setOfficialSubmitting(true);
    setUnexpectedError(null);
    setOfficialSummary(null);
    setOfficialVerification(null);
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
          setOfficialVerification(null);
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
        setOfficialVerification(body);
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
        setOfficialSummary(body.eligible ? null : `Server verified · ${rank}${best}`);
        if (body.eligible) {
          // Stop the solve timer at server verification, before the optional
          // account streak lookup completes.
          setCompletion({ streak: null });
          let streak: number | null = null;
          try {
            const streakResponse = await fetch("/api/account/streak", { method: "GET", cache: "no-store" });
            const streakBody = (await streakResponse.json()) as { ok?: boolean; currentStreak?: number };
            if (streakBody.ok && typeof streakBody.currentStreak === "number") streak = streakBody.currentStreak;
          } catch {
            // The verified completion still stops the timer if streak loading fails.
          }
          setCompletion({ streak, submission: body });
        }
        bumpRankRefresh();
      } catch {
        setUnexpectedError("Could not submit official architecture.");
        setRunState("error");
      } finally {
        setOfficialSubmitting(false);
      }
    })();
  }, [architecture, officialSession, bumpRankRefresh, playback, setCompletion]);

  const onSelectComponent = useCallback(
    (componentId: string, deploymentId?: string) => {
      if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
      attentionTimeoutRef.current = null;
      setAttentionComponentId(null);
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
      if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
      attentionTimeoutRef.current = null;
      setAttentionComponentId(null);
      setWorldSelection({ kind: "region", regionId });
      const deployed = architecture.components.find((component) =>
        component.deployments.some((deployment) => deployment.regionId === regionId),
      );
      if (deployed) setSelectedComponentId(deployed.id);
    },
    [architecture],
  );

  const clearSelection = useCallback(() => {
    if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
    attentionTimeoutRef.current = null;
    setAttentionComponentId(null);
    setSelectedComponentId(null);
    setSelectedConnectionId(null);
    setWorldSelection(null);
  }, []);

  const spotlightPresentationCue = useCallback((cue: PresentationCue) => {
    // Every cue replaces both the visible mark set and any deferred camera work.
    const version = presentationVersionRef.current + 1;
    presentationVersionRef.current = version;
    pendingCameraRef.current = null;

    const liveComponents = new Set(architecture.components.map((component) => component.id));
    const liveConnections = new Map(architecture.connections.map((connection) => [connection.id, connection]));
    const componentIds: string[] = [];
    const connectionIds = new Set<string>();
    const addComponent = (id: string) => {
      if (liveComponents.has(id) && !componentIds.includes(id) && (cue.kind !== "path" || componentIds.length < 5)) componentIds.push(id);
    };

    // Explicit components preserve evidence order. Connection-only cues gain their
    // live endpoints so a relationship can still be framed.
    for (const target of cue.targets) {
      if (target.kind === "component") addComponent(target.entityId);
      if (target.kind === "connection") {
        const connection = liveConnections.get(target.entityId);
        if (!connection) continue;
        connectionIds.add(connection.id);
        addComponent(connection.sourceComponentId);
        addComponent(connection.targetComponentId);
      }
    }
    const primary = cue.targets.find((target) => target.emphasis === "primary");
    const primaryComponentId = primary?.kind === "component" && componentIds.includes(primary.entityId)
      ? primary.entityId
      : componentIds[0];
    if (!primaryComponentId) return;

    if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
    setAttentionComponentIds(new Set(componentIds));
    setAttentionConnectionIds(connectionIds);
    setAttentionPrimaryConnectionId(
      [...connectionIds].find((connectionId) => {
        const connection = liveConnections.get(connectionId);
        return connection?.sourceComponentId === primaryComponentId || connection?.targetComponentId === primaryComponentId;
      }) ?? null,
    );
    setAttentionComponentId(primaryComponentId);

    if (cue.camera === "frame-primary" || cue.camera === "frame-path" || cue.camera === "frame-set") {
      const frameIds = cue.camera === "frame-primary" ? [primaryComponentId] : componentIds;
      pendingCameraRef.current = { version, componentIds: frameIds };
      if (viewMode !== "logical") setViewMode("logical");
      if (!canvasInteractionRef.current && viewMode === "logical") {
        pendingCameraRef.current = null;
        fitView({ nodes: frameIds.map((id) => ({ id })), duration: 350, padding: 0.55, maxZoom: 1.15 });
      }
    }
    attentionTimeoutRef.current = window.setTimeout(() => {
      if (presentationVersionRef.current !== version) return;
      pendingCameraRef.current = null;
      setAttentionComponentId(null);
      setAttentionComponentIds(new Set());
      setAttentionConnectionIds(new Set());
      setAttentionPrimaryConnectionId(null);
      attentionTimeoutRef.current = null;
    }, 4500);
  }, [architecture.components, architecture.connections, fitView, viewMode]);

  useEffect(() => {
    const componentIds = new Set(architecture.components.map((component) => component.id));
    const connectionIds = new Set(architecture.connections.map((connection) => connection.id));
    setAttentionComponentIds((current) => new Set([...current].filter((id) => componentIds.has(id))));
    setAttentionConnectionIds((current) => new Set([...current].filter((id) => connectionIds.has(id))));
  }, [architecture.components, architecture.connections]);

  useEffect(() => {
    if (attentionComponentId !== null) return;
    setAttentionComponentIds(new Set());
    setAttentionConnectionIds(new Set());
    setAttentionPrimaryConnectionId(null);
  }, [attentionComponentId]);

  // A cue arriving while the world map is visible switches views first; the
  // logical React Flow instance can then receive the exact queued node set.
  useEffect(() => {
    if (viewMode !== "logical" || canvasInteractionRef.current) return;
    const pending = pendingCameraRef.current;
    if (!pending || pending.version !== presentationVersionRef.current) return;
    const componentIds = pending.componentIds.filter((id) => architecture.components.some((component) => component.id === id));
    pendingCameraRef.current = null;
    if (componentIds.length > 0) {
      fitView({ nodes: componentIds.map((id) => ({ id })), duration: 350, padding: 0.55, maxZoom: 1.15 });
    }
  }, [architecture.components, fitView, viewMode]);

  const setCanvasInteraction = useCallback((active: boolean) => {
    canvasInteractionRef.current = active;
    if (active || viewMode !== "logical") return;
    const pending = pendingCameraRef.current;
    pendingCameraRef.current = null;
    const componentIds = pending?.componentIds.filter((id) => architecture.components.some((component) => component.id === id)) ?? [];
    if (pending && pending.version === presentationVersionRef.current && componentIds.length > 0) {
      fitView({ nodes: componentIds.map((id) => ({ id })), duration: 350, padding: 0.55, maxZoom: 1.15 });
    }
  }, [architecture.components, fitView, viewMode]);

  useEffect(() => () => {
    if (attentionTimeoutRef.current !== null) window.clearTimeout(attentionTimeoutRef.current);
  }, []);

  const focusComponentInPresentation = useCallback(
    (componentId: string) => {
      const component = architecture.components.find((candidate) => candidate.id === componentId);
      if (!component) return;
      setSelectedComponentId(componentId);
      setSelectedConnectionId(null);
      setWorldSelection(worldSelectionForComponent(architecture, componentId));
      // An explicit focus request should behave like the player clicked the
      // component: return to the logical board and perform the real fitView.
      const version = presentationVersionRef.current + 1;
      presentationVersionRef.current = version;
      pendingCameraRef.current = { version, componentIds: [componentId] };
      if (viewMode !== "logical") {
        setViewMode("logical");
      } else if (!canvasInteractionRef.current) {
        pendingCameraRef.current = null;
        fitView({ nodes: [{ id: componentId }], duration: 250, padding: 0.4 });
      }
    },
    [architecture, fitView, viewMode],
  );

  const focusConnectionInPresentation = useCallback((connectionId: string) => {
    const connection = architecture.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return;
    const evidenceRevision = webMcpReconciliationKey;
    spotlightPresentationCue({
      contractVersion: "presentation-1",
      kind: "path",
      reason: "causal-path",
      camera: "frame-path",
      targets: [
        { ref: connection.id, kind: "connection", entityId: connection.id, evidenceRevision, emphasis: "primary" },
        { ref: connection.sourceComponentId, kind: "component", entityId: connection.sourceComponentId, evidenceRevision, emphasis: "secondary" },
        { ref: connection.targetComponentId, kind: "component", entityId: connection.targetComponentId, evidenceRevision, emphasis: "secondary" },
      ],
    });
  }, [architecture.connections, spotlightPresentationCue, webMcpReconciliationKey]);

  const reviewFirstFailure = useCallback(() => {
    if (!simulationResult || runState !== "complete") return;
    const focus = firstFailureFocus(simulationResult);
    if (focus?.kind === "component") {
      focusComponentInPresentation(focus.componentId);
      return;
    }
    setSelectedComponentId(null);
    setSelectedConnectionId(null);
    setWorldSelection(null);
    setRequirementsReviewKey((key) => key + 1);
  }, [focusComponentInPresentation, runState, simulationResult]);

  const focusRegionInPresentation = useCallback((regionId: RegionId) => {
    setViewMode("world");
    setSelectedConnectionId(null);
    setWorldSelection({ kind: "region", regionId });
  }, []);

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
    pinnedObservations,
    runState,
    lastRunKey,
    simulationResult,
    experimentPresentation,
    simulationErrors,
    unexpectedError,
    resultIsStale,
    requirementsReviewKey,
    showSimulationVisuals,
    officialSubmitting,
    officialSummary,
    officialVerification,
    officialSession,
    semanticZoomOut,
    setSemanticZoomOut,
    nodes,
    edges,
    enclosureRegions,
    showCanvasEmptyState,
    interactionNotice,
    playback,
    playbackVisualsActive,
    culpritComponentId,
    presentExperiment,
    clearExperimentPresentation,
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
    handleSimBarStep,
    handleSimBarReset,
    handleViewModeChange,
    loadHeroScene,
    startOfficialAttemptFromBriefing,
    onSubmitOfficial,
    onSelectComponent,
    onSelectRegion,
    clearSelection,
    spotlightPresentationCue,
    setCanvasInteraction,
    reviewFirstFailure,
    pinObservation: (observation: PinnedObservation) => setPinnedObservations((current) => [...current.filter((entry) => `${entry.target}:${entry.id}:${entry.metricId}` !== `${observation.target}:${observation.id}:${observation.metricId}`), observation].slice(-6)),
    clearPinnedObservations: () => setPinnedObservations([]),
    focusComponentInPresentation,
    focusConnectionInPresentation,
    focusRegionInPresentation,
  };
}
