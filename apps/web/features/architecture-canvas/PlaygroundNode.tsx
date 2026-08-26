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
  type GlyphSimulationResult,
} from "@/features/playground-glyphs";

export type PlaygroundNodeData = {
  component: ComponentInstance;
  definition: ComponentDefinition;
  simulation: GlyphSimulationResult | null;
  resultIsStale: boolean;
  attention: boolean;
  connectedPortIds: ReadonlySet<string>;
};

type PlaygroundFlowNode = Node<PlaygroundNodeData, "playground">;

export function PlaygroundNode({ data, selected, dragging }: NodeProps<PlaygroundFlowNode>) {
  const glyphCatalog = glyphPropsFromComponent(data.component, data.definition);
  const dimensions = glyphDimensionsForProps(glyphCatalog);
  const glyphOptions = { resultIsStale: data.resultIsStale, selected };
  const glyphState = deriveGlyphState(data.component.id, data.simulation, glyphOptions);
  const mechanism = deriveGlyphMechanismValues(data.component.id, data.simulation, {
    resultIsStale: data.resultIsStale,
  });
  const ariaLabel = glyphStateAriaLabel(data.component.id, data.simulation, glyphOptions);
  const portFailed = glyphState === "failed";

  return (
    <article
      className={[
        "playground-node",
        data.resultIsStale && data.simulation ? "playground-node--stale" : "",
        data.attention ? "playground-node--attention" : "",
        dragging ? "playground-node--dragging" : "",
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
              aria-label={port.label}
              style={{ top: py }}
            />
          );
        })}
      </div>
      <p className="playground-node__label">{data.definition.label}</p>
    </article>
  );
}
