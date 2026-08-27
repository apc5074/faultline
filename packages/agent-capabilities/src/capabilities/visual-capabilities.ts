import type { CapabilityExecutionOptions } from "../capability.js";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import type { CapabilityResult } from "../result.js";
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
import {
  annotateComponent,
  clearAnnotations,
  focusComponent,
  highlightConnection,
  type ClearAnnotationsIntent,
  type VisualAnnotationIntent,
} from "../visual-executors.js";

export type { ClearAnnotationsIntent, VisualAnnotationIntent } from "../visual-executors.js";
export {
  annotateComponent,
  appendValidatedAnnotations,
  clearAnnotations,
  countAnnotationsToClear,
  focusComponent,
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
] as const;
