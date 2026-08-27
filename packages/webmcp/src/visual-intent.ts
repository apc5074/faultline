import type {
  AgentFocusAnnotation,
  AgentNoteAnnotation,
  AgentPathAnnotation,
  CapabilityResult,
  ClearAnnotationsInput,
  ClearAnnotationsIntent,
  FocusRegionIntent,
  PinObservationIntent,
  VisualAnnotationIntent,
} from "@faultline/agent-capabilities";

export type VisualIntent =
  | {
      readonly kind: "pin_observation";
      readonly observation: PinObservationIntent["observation"];
    }
  | {
      readonly kind: "focus_region";
      readonly regionId: FocusRegionIntent["regionId"];
    }
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

const visualCapabilityNames = new Set([
  "focus_component",
  "annotate_component",
  "highlight_connection",
  "clear_annotations",
  "focus_region",
  "pin_observation",
]);

export function publishVisualIntent(
  capabilityName: string,
  input: unknown,
  result: CapabilityResult<VisualAnnotationIntent | ClearAnnotationsIntent | FocusRegionIntent | PinObservationIntent>,
  onVisualIntent: VisualIntentHandler,
): void {
  if (!result.ok) return;
  if (!visualCapabilityNames.has(capabilityName)) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[Faultline] Ignored unsupported visual capability "${capabilityName}".`);
    }
    return;
  }

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

  if (capabilityName === "focus_region" && "regionId" in result.data) {
    onVisualIntent({ kind: "focus_region", regionId: (result.data as FocusRegionIntent).regionId });
    return;
  }

  if (capabilityName === "pin_observation" && "observation" in result.data) {
    onVisualIntent({ kind: "pin_observation", observation: (result.data as PinObservationIntent).observation });
    return;
  }

  if (
    (capabilityName === "focus_component" || capabilityName === "annotate_component" || capabilityName === "highlight_connection") &&
    "annotation" in result.data
  ) {
    const annotationData = result.data as VisualAnnotationIntent;
    onVisualIntent({
      kind: "annotation",
      annotation: annotationData.annotation,
    });
  }
}
