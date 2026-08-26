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

import type { Architecture, ChallengeDefinition, RegionId } from "@faultline/core";
import type { GeographicRoute } from "@faultline/simulator";

import { PLAYGROUND_SNAP_GRID } from "@/features/architecture-canvas/canvas-grid";
import { InkConnectionLine } from "@/features/architecture-canvas/InkConnectionLine";
import { InkEdge, type InkEdgeData } from "@/features/architecture-canvas/InkEdge";
import { nodeTypes } from "@/features/architecture-canvas/playground-flow-model";
import type { FlowConnectionLike, PlaygroundFlowNode } from "@/features/architecture-canvas/playground-types";
import { RegionEnclosuresLayer } from "@/features/architecture-canvas/RegionEnclosuresLayer";
import { isSemanticZoomOut } from "@/features/architecture-canvas/semantic-zoom";
import { PlaybackPacketLayer, RouteLingerLayer, type PlaybackFrame } from "@/features/traffic-playback";
import { WorldMap, type WorldMapSelection } from "@/features/world-map/WorldMap";

const edgeTypes = { ink: InkEdge };

export type PlaygroundCanvasProps = {
  viewMode: "logical" | "world";
  showCanvasEmptyState: boolean;
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
};

export function PlaygroundCanvas({
  viewMode,
  showCanvasEmptyState,
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
}: PlaygroundCanvasProps) {
  return (
    <div
      className="playground-canvas"
      aria-label={viewMode === "logical" ? "Logical architecture canvas" : "World architecture map"}
    >
      {showCanvasEmptyState ? (
        <p className="playground-canvas__empty-hint">Drag components from the rail · Connect ports · Press Run</p>
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
          geographicRoutes={showSimulationVisuals && !resultIsStale ? geographicRoutes : []}
          routesActive={showSimulationVisuals && !resultIsStale}
          onSelectComponent={onSelectComponent}
          onSelectRegion={onSelectRegion}
        />
      )}
    </div>
  );
}
