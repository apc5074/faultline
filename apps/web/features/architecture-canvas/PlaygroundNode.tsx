"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";

import type { ComponentDefinition, ComponentInstance } from "@faultline/core";

import { PlaygroundHandle } from "@/features/architecture-canvas/PlaygroundHandle";
import { portOffsetY } from "@/features/architecture-canvas/glyph-port-layout";
import {
  ComponentGlyph,
  deriveGlyphMechanismValues,
  deriveGlyphState,
  glyphDimensionsForProps,
  glyphPropsFromComponent,
  glyphStateAriaLabel,
  MINI_GLYPH_SIZE,
  type GlyphSimulationResult,
} from "@/features/playground-glyphs";
import {
  glyphStateFromPlayback,
  mechanismPropsFromPlayback,
  type ComponentPlaybackVisual,
} from "@/features/traffic-playback";

import type { HandleConnectHint } from "@/features/architecture-canvas/playground-connect-hints";
import type { NodeInteractionPhase } from "@/features/architecture-canvas/playground-interaction";

export type PlaygroundNodeData = {
  component: ComponentInstance;
  definition: ComponentDefinition;
  simulation: GlyphSimulationResult | null;
  resultIsStale: boolean;
  playbackVisual?: ComponentPlaybackVisual;
  playbackActive?: boolean;
  attention: boolean;
  connectedPortIds: ReadonlySet<string>;
  interactionPhase: NodeInteractionPhase;
  connectDimmed: boolean;
  portConnectHints: Readonly<Record<string, HandleConnectHint>>;
  regionBelonging: boolean;
  semanticZoomOut: boolean;
};

type PlaygroundFlowNode = Node<PlaygroundNodeData, "playground">;

export function PlaygroundNode({ data, selected, dragging }: NodeProps<PlaygroundFlowNode>) {
  const glyphCatalog = glyphPropsFromComponent(data.component, data.definition);
  const fullDimensions = glyphDimensionsForProps(glyphCatalog);
  const dimensions = data.semanticZoomOut
    ? { width: MINI_GLYPH_SIZE, height: MINI_GLYPH_SIZE }
    : fullDimensions;

  const playbackActive = data.playbackActive ?? false;
  const playbackMechanism = playbackActive
    ? mechanismPropsFromPlayback(data.playbackVisual, glyphCatalog)
    : null;

  const glyphOptions = {
    resultIsStale: data.resultIsStale,
    selected,
    processing: playbackActive
      ? glyphStateFromPlayback(data.playbackVisual) === "processing"
      : false,
  };

  const glyphStateFromSim = deriveGlyphState(data.component.id, data.simulation, glyphOptions);
  const playbackDrivenState = playbackActive ? glyphStateFromPlayback(data.playbackVisual) : null;

  const glyphState = selected
    ? "selected"
    : playbackDrivenState === "overloaded"
      ? "overloaded"
      : playbackDrivenState === "processing"
        ? "processing"
        : glyphStateFromSim;

  const simMechanism =
    playbackActive || data.semanticZoomOut
      ? {}
      : deriveGlyphMechanismValues(data.component.id, data.simulation, {
          resultIsStale: data.resultIsStale,
        });

  const mechanism = playbackMechanism ?? simMechanism;
  const ariaLabel = glyphStateAriaLabel(data.component.id, data.simulation, glyphOptions);
  const portFailed = glyphState === "failed";

  return (
    <article
      className={[
        "playground-node",
        data.resultIsStale && data.simulation ? "playground-node--stale" : "",
        data.attention ? "playground-node--attention" : "",
        dragging ? "playground-node--dragging" : "",
        data.interactionPhase === "settling" ? "playground-node--settling" : "",
        data.interactionPhase === "deleting" ? "playground-node--deleting" : "",
        data.connectDimmed ? "playground-node--connect-dimmed" : "",
        data.regionBelonging ? "playground-node--region-belong" : "",
        data.semanticZoomOut ? "playground-node--semantic-out" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: dimensions.width }}
      aria-label={ariaLabel ? `${data.definition.label}, ${ariaLabel}` : data.definition.label}
    >
      <div
        className="playground-node__glyph-shell"
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <div className="playground-node__glyph" style={{ width: dimensions.width, height: dimensions.height }}>
          <ComponentGlyph
            {...glyphCatalog}
            {...mechanism}
            state={glyphState}
            width={dimensions.width}
            height={dimensions.height}
            mini={data.semanticZoomOut}
          />
        </div>
        {data.definition.ports.map((port) => {
          const py = portOffsetY(data.definition, port.id, dimensions.height);
          const isInput = port.direction === "input";
          return (
            <PlaygroundHandle
              key={port.id}
              id={port.id}
              type={isInput ? "target" : "source"}
              position={isInput ? Position.Left : Position.Right}
              connected={data.connectedPortIds.has(port.id)}
              failed={portFailed}
              connectHint={data.portConnectHints[port.id] ?? "none"}
              portsHidden={data.interactionPhase === "settling" || data.semanticZoomOut}
              aria-label={port.label}
              style={{ top: py }}
            />
          );
        })}
      </div>
      {!data.semanticZoomOut ? <p className="playground-node__label">{data.definition.label}</p> : null}
    </article>
  );
}
