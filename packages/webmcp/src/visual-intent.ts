import type {
  AgentFocusAnnotation,
  AgentNoteAnnotation,
  AgentPathAnnotation,
  CapabilityResult,
  ClearAnnotationsInput,
  ClearAnnotationsIntent,
  VisualAnnotationIntent,
} from "@faultline/agent-capabilities";

export type VisualIntent =
  | {
      readonly kind: "annotation";
      readonly annotation: AgentFocusAnnotation | AgentNoteAnnotation | AgentPathAnnotation;
    }
  | {
      readonly kind: "clear";
      readonly scope: "all" | "component";
      readonly componentId?: string;
      readonly clearedCount: number;
    };

export type VisualIntentHandler = (intent: VisualIntent) => void;

export function publishVisualIntent(
  capabilityName: string,
  input: unknown,
  result: CapabilityResult<VisualAnnotationIntent | ClearAnnotationsIntent>,
  onVisualIntent: VisualIntentHandler,
): void {
  if (!result.ok) return;

  if (capabilityName === "clear_annotations") {
    const clearInput = (input ?? {}) as ClearAnnotationsInput;
    const clearData = result.data as ClearAnnotationsIntent;
    onVisualIntent({
      kind: "clear",
      scope: clearInput.scope ?? "all",
      ...(clearInput.componentId !== undefined ? { componentId: clearInput.componentId } : {}),
      clearedCount: clearData.clearedCount,
    });
    return;
  }

  if ("annotation" in result.data) {
    const annotationData = result.data as VisualAnnotationIntent;
    onVisualIntent({
      kind: "annotation",
      annotation: annotationData.annotation,
    });
  }
}
