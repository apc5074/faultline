import type {
  ComponentExplanationPresentation,
  VisualApplicationReceipt,
} from "@faultline/agent-capabilities";

/**
 * Browser adapter boundary for the component-explanation visual handshake.
 * The page implementation is deliberately asynchronous: accepting a callback
 * is not equivalent to committing the annotation to its render layer.
 */
export type ComponentExplanationPresentationHandler = (
  command: ComponentExplanationPresentation,
  options: { readonly signal?: AbortSignal },
) => Promise<VisualApplicationReceipt>;

/** A short, explicit upper bound prevents a missing renderer from hanging a read. */
export const COMPONENT_EXPLANATION_RENDER_DEADLINE_MS = 1_500;
