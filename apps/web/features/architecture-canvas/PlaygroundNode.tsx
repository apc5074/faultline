"use client";

import { Position, type Node, type NodeProps } from "@xyflow/react";

import type { ComponentDefinition, ComponentInstance } from "@faultline/core";

import { PlaygroundHandle } from "@/features/architecture-canvas/PlaygroundHandle";
import { portOffsetY } from "@/features/architecture-canvas/glyph-port-layout";
import { challengeRedirectRpsFor, usePlaygroundChallenge } from "@/features/architecture-canvas/playground-challenge";
import {
  ComponentGlyph,
  glyphDimensionsForProps,
  glyphPropsFromComponent,
  glyphStateAriaLabel,
  isFailingGlyphState,
  MINI_GLYPH_SIZE,
  type GlyphSimulationResult,
} from "@/features/playground-glyphs";
import {
  glyphStateFromPlayback,
  MAX_VISIBLE_REJECTED_PER_COMPONENT,
  mechanismPropsFromPlayback,
  playbackGlyphState,
  selectComponentVisualEvidence,
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
  /** Changes each run start — retriggers the traffic-source starting pulse. */
  runPulseKey?: string;
  /** Settled: this node was the first component to fail in the last run. */
  firstFailing?: boolean;
  attention: boolean;
  attentionPrimary: boolean;
  connectedPortIds: ReadonlySet<string>;
  interactionPhase: NodeInteractionPhase;
  connectDimmed: boolean;
  portConnectHints: Readonly<Record<string, HandleConnectHint>>;
  regionBelonging: boolean;
  semanticZoomOut: boolean;
};

type PlaygroundFlowNode = Node<PlaygroundNodeData, "playground">;

export function PlaygroundNode({ data, selected, dragging }: NodeProps<PlaygroundFlowNode>) {
  const { challenge } = usePlaygroundChallenge();
  const challengeRedirectRps = challengeRedirectRpsFor(challenge);
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

  const settledEvidence = selectComponentVisualEvidence({
    component: data.component,
    simulation: data.simulation,
    redirectRps: challengeRedirectRps,
    resultIsStale: data.resultIsStale,
  });
  const glyphStateFromSim = selected ? "selected" : settledEvidence.state;

  const glyphState = playbackActive
    ? playbackGlyphState(data.playbackVisual, selected)
    : glyphStateFromSim;

  const simMechanism =
    playbackActive || data.semanticZoomOut
      ? {}
      : settledEvidence;

  const mechanism = playbackMechanism ?? simMechanism;
  const ariaLabel = glyphStateAriaLabel(data.component.id, data.simulation, glyphOptions);
  const evidenceLabel = playbackActive
    ? data.playbackVisual?.evidenceLabel
    : settledEvidence.evidenceLabel;
  const portFailed = isFailingGlyphState(glyphState);
  const rejectedCount = playbackActive ? (data.playbackVisual?.rejectedCount ?? 0) : 0;
  const showRejectionCounter = rejectedCount > MAX_VISIBLE_REJECTED_PER_COMPONENT;
  const showStartPulse =
    data.runPulseKey !== undefined &&
    data.component.type === "traffic-source" &&
    !data.semanticZoomOut;

  return (
    <article
      className={[
        "playground-node",
        data.resultIsStale && data.simulation ? "playground-node--stale" : "",
        data.attention ? "playground-node--attention" : "",
        data.attentionPrimary ? "playground-node--attention-primary" : "",
        dragging ? "playground-node--dragging" : "",
        data.interactionPhase === "settling" ? "playground-node--settling" : "",
        data.interactionPhase === "deleting" ? "playground-node--deleting" : "",
        data.connectDimmed ? "playground-node--connect-dimmed" : "",
        data.regionBelonging ? "playground-node--region-belong" : "",
        data.semanticZoomOut ? "playground-node--semantic-out" : "",
        data.firstFailing ? "playground-node--culprit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: dimensions.width }}
      aria-label={[
        data.definition.label,
        ariaLabel,
        data.firstFailing ? "first to fail last run" : null,
        data.attentionPrimary ? "primary agent-highlighted target" : data.attention ? "agent-highlighted target" : null,
      ]
        .filter(Boolean)
        .join(", ")}
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
        {showStartPulse ? (
          <div key={data.runPulseKey} className="playground-node__start-pulse" aria-hidden="true" />
        ) : null}
        {data.firstFailing ? (
          <span className="playground-node__culprit-tick" aria-hidden="true" />
        ) : null}
        {showRejectionCounter ? (
          <span className="playground-node__rejection-counter" aria-label={`${rejectedCount} requests rejected`}>
            ×{rejectedCount}
          </span>
        ) : null}
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
      {!data.semanticZoomOut && evidenceLabel ? <p className="playground-node__pressure">{evidenceLabel}</p> : null}
    </article>
  );
}
