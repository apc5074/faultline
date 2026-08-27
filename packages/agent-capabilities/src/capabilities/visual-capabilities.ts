import type { CapabilityExecutionOptions } from "../capability.js";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import type { CapabilityResult } from "../result.js";
import { traceRequestInputSchema, type TraceRequestInput } from "../schemas.js";
import {
  annotateComponentInputSchema,
  clearAnnotationsInputSchema,
  focusComponentInputSchema,
  focusRegionInputSchema,
  pinObservationInputSchema,
  highlightConnectionInputSchema,
  type AnnotateComponentInput,
  type ClearAnnotationsInput,
  type FocusComponentInput,
  type FocusRegionInput,
  type PinObservationInput,
  type HighlightConnectionInput,
} from "../visual-schemas.js";
import {
  annotateComponent,
  clearAnnotations,
  focusComponent,
  focusRegion,
  highlightPath,
  highlightConnection,
  type ClearAnnotationsIntent,
  type FocusRegionIntent,
  type HighlightTraceIntent,
  type VisualAnnotationIntent,
} from "../visual-executors.js";
import { pinObservation, type PinObservationIntent } from "../pin-observation.js";

export type { ClearAnnotationsIntent, FocusRegionIntent, HighlightTraceIntent, VisualAnnotationIntent } from "../visual-executors.js";
export {
  annotateComponent,
  appendValidatedAnnotations,
  clearAnnotations,
  countAnnotationsToClear,
  focusComponent,
  focusRegion,
  highlightPath,
  highlightConnection,
} from "../visual-executors.js";

const COACHING_VISUAL_RULES =
  "Inspect read tools first. One finding and one question; do not prescribe canonical topology.";

export const focusComponentCapability: AgentCapability<
  AgentContext,
  FocusComponentInput,
  CapabilityResult<VisualAnnotationIntent>
> = {
  name: "focus_component",
  description: `Draw a focus bracket on one component. ${COACHING_VISUAL_RULES}`,
  inputSchema: focusComponentInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(context, input, options?: CapabilityExecutionOptions) {
    return focusComponent(context, input, options);
  },
};

export const focusRegionCapability: AgentCapability<
  AgentContext,
  FocusRegionInput,
  CapabilityResult<FocusRegionIntent>
> = {
  name: "focus_region",
  description: "Focus one active challenge traffic-origin region on the world map.",
  inputSchema: focusRegionInputSchema,
  mode: "visual",
  availableWhen: (context) => (context.challenge.geographicDistribution?.length ?? 0) > 0,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(context, input) {
    return focusRegion(context, input);
  },
};

export const highlightPathCapability: AgentCapability<
  AgentContext,
  TraceRequestInput,
  CapabilityResult<HighlightTraceIntent>
> = {
  name: "highlight_path",
  description: "Highlight a simulator-resolved geographic redirect or write trace; it never accepts drawing coordinates.",
  inputSchema: traceRequestInputSchema,
  mode: "visual",
  availableWhen: (context) => (context.challenge.geographicDistribution?.length ?? 0) > 0,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(context, input) {
    return highlightPath(context, input);
  },
};

export const pinObservationCapability: AgentCapability<
  AgentContext,
  PinObservationInput,
  CapabilityResult<PinObservationIntent>
> = {
  name: "pin_observation",
  description: "Pin one named factual baseline observation. Free-form text and unsupported metrics are rejected.",
  inputSchema: pinObservationInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: { readOnlyHint: false, destructiveHint: false },
  execute(context, input) { return pinObservation(context, input); },
};

export const annotateComponentCapability: AgentCapability<
  AgentContext,
  AnnotateComponentInput,
  CapabilityResult<VisualAnnotationIntent>
> = {
  name: "annotate_component",
  description: `Add marginal coaching prose beside one component (max 280 characters). ${COACHING_VISUAL_RULES}`,
  inputSchema: annotateComponentInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(context, input, options?: CapabilityExecutionOptions) {
    return annotateComponent(context, input, options);
  },
};

export const highlightConnectionCapability: AgentCapability<
  AgentContext,
  HighlightConnectionInput,
  CapabilityResult<VisualAnnotationIntent>
> = {
  name: "highlight_connection",
  description: `Emphasize one existing connection when discussing traffic flow. ${COACHING_VISUAL_RULES}`,
  inputSchema: highlightConnectionInputSchema,
  mode: "visual",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  execute(context, input, options?: CapabilityExecutionOptions) {
    return highlightConnection(context, input, options);
  },
};

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
  execute(context, input, options?: CapabilityExecutionOptions) {
    return clearAnnotations(context, input, options);
  },
};

export const BASELINE_VISUAL_CAPABILITIES = [
  focusComponentCapability,
  annotateComponentCapability,
  highlightConnectionCapability,
  clearAnnotationsCapability,
  focusRegionCapability,
  highlightPathCapability,
  pinObservationCapability,
] as const;
