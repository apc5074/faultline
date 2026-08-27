import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import type { AgentFocusAnnotation, AgentNoteAnnotation, AgentPathAnnotation } from "../session.js";
import {
  annotateComponentInputSchema,
  clearAnnotationsInputSchema,
  focusComponentInputSchema,
  highlightConnectionInputSchema,
  type AnnotateComponentInput,
  type ClearAnnotationsInput,
  type FocusComponentInput,
  type HighlightConnectionInput,
} from "../visual-schemas.js";

export interface VisualAnnotationIntent {
  readonly annotation: AgentFocusAnnotation | AgentNoteAnnotation | AgentPathAnnotation;
}

export interface ClearAnnotationsIntent {
  readonly clearedCount: number;
}

/** W-07 stub — replaced by validated executors in W-08. */
export const focusComponentCapability: AgentCapability<
  AgentContext,
  FocusComponentInput,
  CapabilityResult<VisualAnnotationIntent>
> = {
  name: "focus_component",
  description:
    "Draw a focus bracket on one component. Inspect first; use when naming a specific component in coaching.",
  inputSchema: focusComponentInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(_context, input) {
    return capabilityOk({
      annotation: {
        id: `focus-${input.componentId}`,
        type: "focus",
        componentId: input.componentId,
      },
    });
  },
};

/** W-07 stub — replaced by validated executors in W-08. */
export const annotateComponentCapability: AgentCapability<
  AgentContext,
  AnnotateComponentInput,
  CapabilityResult<VisualAnnotationIntent>
> = {
  name: "annotate_component",
  description:
    "Add marginal coaching prose beside one component. One finding and one question; max 280 characters.",
  inputSchema: annotateComponentInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(_context, input) {
    return capabilityOk({
      annotation: {
        id: `note-${input.componentId}`,
        type: "note",
        componentId: input.componentId,
        text: input.text,
        ...(input.tone ? { tone: input.tone } : {}),
      },
    });
  },
};

/** W-07 stub — replaced by validated executors in W-08. */
export const highlightConnectionCapability: AgentCapability<
  AgentContext,
  HighlightConnectionInput,
  CapabilityResult<VisualAnnotationIntent>
> = {
  name: "highlight_connection",
  description: "Emphasize one existing connection on the canvas when discussing traffic flow.",
  inputSchema: highlightConnectionInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(_context, input) {
    return capabilityOk({
      annotation: {
        id: `path-${input.connectionId}`,
        type: "path",
        connectionId: input.connectionId,
        ...(input.label ? { label: input.label } : {}),
      },
    });
  },
};

/** W-07 stub — replaced by validated executors in W-08. */
export const clearAnnotationsCapability: AgentCapability<
  AgentContext,
  ClearAnnotationsInput,
  CapabilityResult<ClearAnnotationsIntent>
> = {
  name: "clear_annotations",
  description: "Clear agent coaching marks from the canvas overlay.",
  inputSchema: clearAnnotationsInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute() {
    return capabilityOk({ clearedCount: 0 });
  },
};

export const BASELINE_VISUAL_CAPABILITIES = [
  focusComponentCapability,
  annotateComponentCapability,
  highlightConnectionCapability,
  clearAnnotationsCapability,
] as const;
