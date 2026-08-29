"use client";

import { useReactFlow, type Connection as FlowConnection, type Edge, type EdgeChange, type NodeChange } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { architectureAvailabilityFingerprint, type PinnedObservation } from "@faultline/agent-capabilities";
import type { SubmitOfficialResponse } from "@/app/api/submissions/route";
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
  connectionFromFlow,
  createComponentInstance,
  createDroppedComponentInstance,
  formatCost,
  reconnectAroundComponent,
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
  const { session: officialSession, bumpRankRefresh } = useOfficialAttempt();
  const [architecture, setArchitecture] = useState<Architecture>(resolveInitialArchitecture);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [attentionComponentId, setAttentionComponentId] = useState<string | null>(null);
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
  const rawResultIsStale = lastRunKey !== null && lastRunKey !== simulationKey;
  // The prior result stays available after an edit, but stale presentation is
  // a settled-state concern: never interrupt a live or draining replay.
  const resultIsStale = rawResultIsStale && runState === "complete" && playback.phase === "settled";
  const showSimulationVisuals = simulationResult !== null && runState === "complete";
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
          resultIsStale,
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
        trafficActive: showSimulationVisuals || playbackVisualsActive,
        resultIsStale,
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
    selectedConnectionId,
    showSimulationVisuals,
    playbackVisualsActive,
    resultIsStale,
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

      const component = createDroppedComponentInstance(
        componentRegistry.get(type),
        clampToPlaygroundBoard(screenToFlowPosition({ x: event.clientX, y: event.clientY })),
      );
      setArchitecture((current) => {
        return { ...current, components: [...current.components, component] };
      });
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

      const removedIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
      if (removedIds.size === 0) return;

      setArchitecture((current) => ({
        ...current,
        connections: current.connections.filter((connection) => !removedIds.has(connection.id)),
      }));
      setSelectedConnectionId((current) => (current && removedIds.has(current) ? null : current));
    },
    [playback.playbackRunning],
  );

  const onRunSimulation = useCallback(() => {
    const runKey = architectureSimulationKey(architecture);
    setRunState("running");
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
          () => setRunState("complete"),
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
  }, [architecture, playback.startTimed]);

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

  const clearSelection = useCallback(() => {
    setSelectedComponentId(null);
    setSelectedConnectionId(null);
    setWorldSelection(null);
  }, []);

  const focusComponentInPresentation = useCallback(
    (componentId: string) => {
      const component = architecture.components.find((candidate) => candidate.id === componentId);
      if (!component) return;
      setSelectedComponentId(componentId);
      setSelectedConnectionId(null);
      setWorldSelection(worldSelectionForComponent(architecture, componentId));
      if (viewMode === "logical") fitView({ nodes: [{ id: componentId }], duration: 250, padding: 0.4 });
    },
    [architecture, fitView, viewMode],
  );

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
    onSubmitOfficial,
    onSelectComponent,
    onSelectRegion,
    clearSelection,
    reviewFirstFailure,
    pinObservation: (observation: PinnedObservation) => setPinnedObservations((current) => [...current.filter((entry) => `${entry.target}:${entry.id}:${entry.metricId}` !== `${observation.target}:${observation.id}:${observation.metricId}`), observation].slice(-6)),
    clearPinnedObservations: () => setPinnedObservations([]),
    focusComponentInPresentation,
    focusRegionInPresentation,
  };
}
