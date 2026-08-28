import type { Edge } from "@xyflow/react";

import { componentRegistry } from "@faultline/component-catalog";
import type { ComponentInstance, Connection as ArchitectureConnection, RegionId } from "@faultline/core";

import { playgroundNodeHeight } from "@/features/architecture-canvas/glyph-port-layout";
import { type InkEdgeData } from "@/features/architecture-canvas/InkEdge";
import { PlaygroundNode, type PlaygroundNodeData } from "@/features/architecture-canvas/PlaygroundNode";
import {
  connectHintForPort,
  nodeHasCompatiblePort,
  type ConnectingFrom,
} from "@/features/architecture-canvas/playground-connect-hints";
import type { NodeInteractionPhase } from "@/features/architecture-canvas/playground-interaction";
import type { FlowConnectionLike, PlaygroundFlowNode, SuccessfulSimulation } from "@/features/architecture-canvas/playground-types";
import { componentBelongsInEnclosure } from "@/features/architecture-canvas/region-enclosures";
import { glyphDimensionsForProps, glyphPropsFromComponent, MINI_GLYPH_SIZE, type GlyphSimulationResult } from "@/features/playground-glyphs";
import type { ComponentPlaybackVisual } from "@/features/traffic-playback";

function simulationSnapshot(simulation: SuccessfulSimulation | null): GlyphSimulationResult | null {
  if (!simulation) return null;
  return {
    services: simulation.services,
    postgres: simulation.postgres,
    caches: simulation.caches,
    events: simulation.events,
    hotKey: simulation.hotKey,
    level2: simulation.level2,
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

export function componentToNode(
  component: ComponentInstance,
  connections: readonly ArchitectureConnection[],
  selectedComponentId: string | null,
  simulation: SuccessfulSimulation | null,
  resultIsStale: boolean,
  attentionComponentId: string | null,
  playbackVisual: ComponentPlaybackVisual | undefined,
  playbackActive: boolean,
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
      playbackVisual,
      playbackActive,
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

export const nodeTypes = { playground: PlaygroundNode };

export function connectionToEdge(
  connection: ArchitectureConnection,
  context: {
    selected?: boolean;
    deletable?: boolean;
    activeConnectionIds: ReadonlySet<string>;
    trafficActive: boolean;
    resultIsStale: boolean;
    load: number;
    playbackLoad: number;
    offset: number;
    hops: InkEdgeData["hops"];
    pulse: boolean;
    peeling: boolean;
    semanticZoomOut: boolean;
  },
): Edge<InkEdgeData, "ink"> {
  const visualLoad = Math.max(context.load, context.playbackLoad);
  const active =
    context.trafficActive &&
    (context.activeConnectionIds.has(connection.id) || visualLoad > 0);
  return {
    id: connection.id,
    type: "ink",
    source: connection.sourceComponentId,
    sourceHandle: connection.sourcePortId,
    target: connection.targetComponentId,
    targetHandle: connection.targetPortId,
    selected: context.selected,
    selectable: true,
    deletable: context.deletable ?? false,
    focusable: true,
    data: {
      load: visualLoad,
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

export type { PlaygroundNodeData };
