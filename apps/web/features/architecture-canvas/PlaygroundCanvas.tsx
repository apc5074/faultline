"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnConnectStart,
} from "@xyflow/react";
import type { Dispatch, DragEvent, SetStateAction } from "react";

import type { Architecture, ChallengeDefinition, ExperimentResult, RegionId } from "@faultline/core";
import type { GeographicRoute } from "@faultline/simulator";

import { AgentAnnotationLayer } from "@/features/agent-annotations";
import {
  PLAYGROUND_DEFAULT_VIEWPORT,
  PLAYGROUND_MAX_ZOOM,
  PLAYGROUND_MIN_ZOOM,
  PLAYGROUND_NODE_EXTENT,
  PLAYGROUND_SNAP_GRID,
  PLAYGROUND_TRANSLATE_EXTENT,
} from "@/features/architecture-canvas/canvas-grid";
import { InkConnectionLine } from "@/features/architecture-canvas/InkConnectionLine";
import { InkEdge, type InkEdgeData } from "@/features/architecture-canvas/InkEdge";
import { nodeTypes } from "@/features/architecture-canvas/playground-flow-model";
import type { FlowConnectionLike, PlaygroundFlowNode } from "@/features/architecture-canvas/playground-types";
// import { RegionEnclosuresLayer } from "@/features/architecture-canvas/RegionEnclosuresLayer";
import { isSemanticZoomOut } from "@/features/architecture-canvas/semantic-zoom";
import { PlaybackPacketLayer, RouteLingerLayer, type PlaybackFrame } from "@/features/traffic-playback";
import { WorldMap, type WorldMapSelection } from "@/features/world-map/WorldMap";
import { regionFailurePresentationFromEvents } from "@/features/world-map/region-failure-presentation";

const edgeTypes = { ink: InkEdge };

export type PlaygroundCanvasProps = {
  viewMode: "logical" | "world";
  showCanvasEmptyState: boolean;
  interactionNotice: string | null;
  semanticZoomOut: boolean;
  nodes: PlaygroundFlowNode[];
  edges: Edge<InkEdgeData, "ink">[];
  architecture: Architecture;
  challenge: ChallengeDefinition;
  selectedComponentId: string | null;
  worldSelection: WorldMapSelection;
  showSimulationVisuals: boolean;
  resultIsStale: boolean;
  geographicRoutes: readonly GeographicRoute[];
  /** Motion belongs only to live playback; completed runs are static evidence. */
  worldRoutesAnimating: boolean;
  worldRoutesStale: boolean;
  experimentPresentation: ExperimentResult | null;
  playbackVisualsActive: boolean;
  playbackFrame: PlaybackFrame;
  enclosureRegions: readonly RegionId[];
  onNodesChange: (changes: NodeChange<PlaygroundFlowNode>[]) => void;
  onConnect: (connection: FlowConnection) => void;
  onConnectStart: OnConnectStart;
  onConnectEnd: () => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  isValidConnection: (connection: FlowConnection | Edge | FlowConnectionLike) => boolean;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  setSemanticZoomOut: Dispatch<SetStateAction<boolean>>;
  onSelectComponent: (componentId: string, deploymentId?: string) => void;
  onSelectRegion: (regionId: RegionId) => void;
  onClearWorldSelection: () => void;
  onViewportInteraction: (active: boolean) => void;
};

export function PlaygroundCanvas({
  viewMode,
  showCanvasEmptyState,
  interactionNotice,
  semanticZoomOut,
  nodes,
  edges,
  architecture,
  challenge,
  selectedComponentId,
  worldSelection,
  showSimulationVisuals,
  resultIsStale,
  geographicRoutes,
  worldRoutesAnimating,
  worldRoutesStale,
  experimentPresentation,
  playbackVisualsActive,
  playbackFrame,
  enclosureRegions,
  onNodesChange,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onEdgesChange,
  isValidConnection,
  onDragOver,
  onDrop,
  setSemanticZoomOut,
  onSelectComponent,
  onSelectRegion,
  onClearWorldSelection,
  onViewportInteraction,
}: PlaygroundCanvasProps) {
  return (
    <div
      className="playground-canvas"
      aria-label={viewMode === "logical" ? "Logical architecture canvas" : "World architecture map"}
    >
      {showCanvasEmptyState ? (
        <p className="playground-canvas__empty-hint">Drag a component here to start. Connect ports, then Run.</p>
      ) : null}
      {interactionNotice ? (
        <p className="playground-canvas__interaction-notice" role="status">
          {interactionNotice}
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
          onConnectStart={(event, params) => {
            onViewportInteraction(true);
            onConnectStart(event, params);
          }}
          onConnectEnd={() => {
            onConnectEnd();
            onViewportInteraction(false);
          }}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={() => onViewportInteraction(true)}
          onNodeDragStop={() => onViewportInteraction(false)}
          isValidConnection={isValidConnection}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onInit={(instance) => {
            // Starter (users + service) keeps the left-biased viewport; richer scenes fit.
            if (architecture.components.length <= 2) {
              instance.setViewport({ ...PLAYGROUND_DEFAULT_VIEWPORT });
            } else {
              instance.fitView({ padding: 0.3, minZoom: PLAYGROUND_MIN_ZOOM, maxZoom: PLAYGROUND_MAX_ZOOM });
            }
            setSemanticZoomOut(isSemanticZoomOut(instance.getZoom()));
          }}
          onMove={(_event, viewport) => {
            setSemanticZoomOut((current) => {
              const next = isSemanticZoomOut(viewport.zoom);
              return current === next ? current : next;
            });
          }}
          onMoveStart={() => onViewportInteraction(true)}
          onMoveEnd={() => onViewportInteraction(false)}
          defaultViewport={PLAYGROUND_DEFAULT_VIEWPORT}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={PLAYGROUND_MIN_ZOOM}
          maxZoom={PLAYGROUND_MAX_ZOOM}
          translateExtent={PLAYGROUND_TRANSLATE_EXTENT}
          nodeExtent={PLAYGROUND_NODE_EXTENT}
          snapToGrid
          snapGrid={PLAYGROUND_SNAP_GRID}
          panOnScroll
          selectionOnDrag={false}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#b8ae9e" />
          {/* Region outlines hidden for now — uncomment to restore location enclosures. */}
          {/* <RegionEnclosuresLayer regionIds={enclosureRegions} semanticZoomOut={semanticZoomOut} /> */}
          <AgentAnnotationLayer architecture={architecture} semanticZoomOut={semanticZoomOut} />
          {playbackVisualsActive ? (
            <PlaybackPacketLayer
              architecture={architecture}
              packets={playbackFrame.packets}
              semanticZoomOut={semanticZoomOut}
            />
          ) : null}
          {playbackFrame.routeLingers.length > 0 ? (
            <RouteLingerLayer
              architecture={architecture}
              lingers={playbackFrame.routeLingers}
              semanticZoomOut={semanticZoomOut}
            />
          ) : null}
          <Controls showInteractive={false} className="playground-flow__controls" position="bottom-left" />
        </ReactFlow>
      ) : (
        <WorldMap
          architecture={architecture}
          challenge={challenge}
          selectedComponentId={selectedComponentId}
          selection={worldSelection}
          geographicRoutes={showSimulationVisuals ? geographicRoutes : []}
          routesActive={showSimulationVisuals}
          routesAnimating={worldRoutesAnimating && showSimulationVisuals && !resultIsStale}
          routesStale={worldRoutesStale && showSimulationVisuals}
          regionFailure={regionFailurePresentationFromEvents(experimentPresentation?.events)}
          onSelectComponent={onSelectComponent}
          onSelectRegion={onSelectRegion}
          onClearSelection={onClearWorldSelection}
        />
      )}
    </div>
  );
}
