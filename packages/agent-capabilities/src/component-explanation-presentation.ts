import { createScopedEntityReference, type ScopedEntityReference } from "./evidence-result.js";

/**
 * Cross-adapter handshake for a direct explanation of one current component.
 *
 * This is presentation state, never architecture or simulator evidence. The
 * WebMCP adapter owns dispatching it and the page owns acknowledging it.
 */
export const COMPONENT_EXPLANATION_PRESENTATION_VERSION = "component-explanation-1" as const;

export interface ComponentExplanationPresentation {
  readonly contractVersion: typeof COMPONENT_EXPLANATION_PRESENTATION_VERSION;
  /** Opaque per-request identifier; do not derive meaning from this value. */
  readonly commandId: string;
  readonly kind: "focus_component";
  readonly component: ScopedEntityReference & { readonly kind: "component" };
  readonly evidenceRevision: string;
  readonly sessionRevision: number;
}

/** A page-owned receipt means the focus annotation reached its render layer. */
export interface VisualApplicationReceipt {
  readonly contractVersion: typeof COMPONENT_EXPLANATION_PRESENTATION_VERSION;
  readonly commandId: string;
  readonly componentId: string;
  readonly evidenceRevision: string;
  readonly appliedSessionRevision: number;
  /** The focus annotation reached the page render layer. */
  readonly annotationStatus: "rendered";
  /** The page-owned camera command completed for this exact component. */
  readonly cameraStatus: "centered";
  /** Final viewport zoom reported after the camera animation completed. */
  readonly appliedZoom: number;
  readonly status: "applied" | "rejected";
}

/** Result of the page-owned single-component camera command. */
export interface ComponentCameraApplication {
  readonly componentId: string;
  readonly status: "centered";
  readonly zoom: number;
}

export function createComponentExplanationPresentation(input: {
  commandId: string;
  componentId: string;
  evidenceRevision: string;
  sessionRevision: number;
}): ComponentExplanationPresentation {
  return {
    contractVersion: COMPONENT_EXPLANATION_PRESENTATION_VERSION,
    commandId: input.commandId,
    kind: "focus_component",
    component: {
      ...createScopedEntityReference("component", input.componentId, input.evidenceRevision),
      kind: "component",
    },
    evidenceRevision: input.evidenceRevision,
    sessionRevision: input.sessionRevision,
  };
}

/** Reject receipts from a different command, target, or evidence revision. */
export function isMatchingVisualApplicationReceipt(
  command: ComponentExplanationPresentation,
  receipt: VisualApplicationReceipt,
): boolean {
  return receipt.contractVersion === COMPONENT_EXPLANATION_PRESENTATION_VERSION &&
    receipt.status === "applied" &&
    receipt.commandId === command.commandId &&
    receipt.componentId === command.component.entityId &&
    receipt.evidenceRevision === command.evidenceRevision &&
    receipt.appliedSessionRevision >= command.sessionRevision &&
    receipt.annotationStatus === "rendered" &&
    receipt.cameraStatus === "centered" &&
    Number.isFinite(receipt.appliedZoom) &&
    receipt.appliedZoom > 0;
}
