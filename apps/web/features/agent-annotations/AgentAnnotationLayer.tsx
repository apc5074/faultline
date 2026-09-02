"use client";

import type { AgentFocusAnnotation, AgentNoteAnnotation, AgentPathAnnotation, AgentStampAnnotation } from "@faultline/agent-capabilities";
import { AGENT_ANNOTATION_MAX_COUNT } from "@faultline/agent-capabilities";
import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";
import { useViewport } from "@xyflow/react";
import { useEffect, useMemo } from "react";

import { useAgentSessionState, useComponentExplanationBarrier } from "@/features/agent-session/AgentSessionProvider";
import {
  buildEdgePathsFromArchitecture,
  computeParallelOffsets,
} from "@/features/architecture-canvas/ink-edge-routing";
import { GLYPH_INK } from "@/features/playground-glyphs";

import { findComponentBounds } from "./component-bounds";

const TICK = 10;
const NOTE_OFFSET_X = 28;
const NOTE_MAX_CHARS_PER_LINE = 36;

function wrapNoteText(text: string): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > NOTE_MAX_CHARS_PER_LINE && current.length > 0) {
      lines.push(current);
      current = word;
      if (lines.length >= 4) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < 4) lines.push(current);
  if (lines.length === 4 && words.join(" ").length > lines.join(" ").length) {
    lines[3] = `${lines[3]!.slice(0, Math.max(0, NOTE_MAX_CHARS_PER_LINE - 1))}…`;
  }
  return lines;
}

function FocusTicks({ annotation, architecture }: { annotation: AgentFocusAnnotation; architecture: Architecture }) {
  const bounds = findComponentBounds(architecture, annotation.componentId);
  if (!bounds) return null;
  const { x, y, width, height } = bounds;
  const pad = 4;
  const left = x - pad;
  const top = y - pad;
  const right = x + width + pad;
  const bottom = y + height + pad;

  return (
    <g className="agent-annotation agent-annotation--focus" data-annotation-id={annotation.id}>
      <path d={`M ${left} ${top + TICK} L ${left} ${top} L ${left + TICK} ${top}`} />
      <path d={`M ${right - TICK} ${top} L ${right} ${top} L ${right} ${top + TICK}`} />
      <path d={`M ${left} ${bottom - TICK} L ${left} ${bottom} L ${left + TICK} ${bottom}`} />
      <path d={`M ${right - TICK} ${bottom} L ${right} ${bottom} L ${right} ${bottom - TICK}`} />
    </g>
  );
}

function NoteAnnotation({
  annotation,
  architecture,
  stackIndex,
}: {
  annotation: AgentNoteAnnotation;
  architecture: Architecture;
  stackIndex: number;
}) {
  const bounds = findComponentBounds(architecture, annotation.componentId);
  if (!bounds) return null;

  const toneClass =
    annotation.tone === "risk"
      ? "agent-annotation--risk"
      : annotation.tone === "question"
        ? "agent-annotation--question"
        : "agent-annotation--neutral";

  const startX = bounds.x + bounds.width;
  const startY = bounds.cy + stackIndex * 18;
  const endX = startX + NOTE_OFFSET_X;
  const endY = startY - 8;
  const lines = wrapNoteText(annotation.text);

  return (
    <g
      className={`agent-annotation agent-annotation--note ${toneClass}`}
      data-annotation-id={annotation.id}
    >
      <path d={`M ${startX} ${startY} L ${endX} ${endY}`} className="agent-annotation__leader" />
      <circle cx={startX} cy={startY} r={1.5} className="agent-annotation__anchor" />
      <text x={endX + 4} y={endY} className="agent-annotation__note-text">
        {lines.map((line, index) => (
          <tspan key={`${annotation.id}-line-${index}`} x={endX + 4} dy={index === 0 ? 0 : 11}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function PathAnnotation({
  annotation,
  path,
}: {
  annotation: AgentPathAnnotation;
  path: string | undefined;
}) {
  if (!path) return null;
  const pathId = `agent-path-${annotation.id}`;
  return (
    <g className="agent-annotation agent-annotation--path" data-annotation-id={annotation.id}>
      <path id={pathId} d={path} className="agent-annotation__path-stroke" fill="none" />
      {annotation.label ? (
        <text className="agent-annotation__path-label">
          <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
            {annotation.label}
          </textPath>
        </text>
      ) : null}
    </g>
  );
}

function StampAnnotation({ annotation }: { annotation: AgentStampAnnotation }) {
  return (
    <g className="agent-annotation agent-annotation--stamp" data-annotation-id={annotation.id}>
      <text x={16} y={20 + 14} className="agent-annotation__stamp-text">
        {annotation.toolName ? `${annotation.toolName}: ${annotation.text}` : annotation.text}
      </text>
    </g>
  );
}

/** SVG overlay for agent coaching marks — tracks React Flow pan/zoom; never captures pointer events. */
export function AgentAnnotationLayer({
  architecture,
  semanticZoomOut = false,
}: {
  architecture: Architecture;
  semanticZoomOut?: boolean;
}) {
  const { x, y, zoom } = useViewport();
  const session = useAgentSessionState();
  const componentExplanationBarrier = useComponentExplanationBarrier();

  const annotations = useMemo(
    () => session.annotations.slice(0, AGENT_ANNOTATION_MAX_COUNT),
    [session.annotations],
  );

  const pathByConnectionId = useMemo(() => {
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
    return new Map(paths.map((entry) => [entry.edgeId, entry.path]));
  }, [architecture.components, architecture.connections]);

  const noteStack = useMemo(() => {
    const counts = new Map<string, number>();
    const indexes = new Map<string, number>();
    for (const annotation of annotations) {
      if (annotation.type !== "note") continue;
      const current = counts.get(annotation.componentId) ?? 0;
      indexes.set(annotation.id, current);
      counts.set(annotation.componentId, current + 1);
    }
    return indexes;
  }, [annotations]);

  useEffect(() => {
    if (semanticZoomOut) return;
    for (const annotation of annotations) {
      if (annotation.type !== "focus") continue;
      if (!findComponentBounds(architecture, annotation.componentId)) continue;
      componentExplanationBarrier.acknowledgeFocusRendered(annotation, session.revision);
    }
  }, [annotations, architecture, componentExplanationBarrier, semanticZoomOut, session.revision]);

  if (semanticZoomOut || annotations.length === 0) return null;

  return (
    <svg className="agent-annotation-layer" aria-hidden="true">
      <g transform={`translate(${x}, ${y}) scale(${zoom})`} stroke={GLYPH_INK.ink} fill="none">
        {annotations.map((annotation) => {
          switch (annotation.type) {
            case "focus":
              return (
                <FocusTicks key={annotation.id} annotation={annotation} architecture={architecture} />
              );
            case "note":
              return (
                <NoteAnnotation
                  key={annotation.id}
                  annotation={annotation}
                  architecture={architecture}
                  stackIndex={noteStack.get(annotation.id) ?? 0}
                />
              );
            case "path":
              return (
                <PathAnnotation
                  key={annotation.id}
                  annotation={annotation}
                  path={pathByConnectionId.get(annotation.connectionId)}
                />
              );
            case "stamp":
              return <StampAnnotation key={annotation.id} annotation={annotation} />;
            default:
              return null;
          }
        })}
      </g>
    </svg>
  );
}
