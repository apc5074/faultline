import type { AgentAnnotationTone } from "./session.js";
import type { CapabilityInputSchema } from "./capability.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(input: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(input).every((key) => allowedKeys.includes(key));
}

export interface FocusComponentInput {
  readonly componentId: string;
}

export const focusComponentInputSchema: CapabilityInputSchema<FocusComponentInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      componentId: { type: "string", minLength: 1 },
    },
    required: ["componentId"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) {
      return { success: false as const, errors: ["focus_component input must be an object."] };
    }
    if (!hasOnlyKeys(input, ["componentId"])) {
      return { success: false as const, errors: ["focus_component input contains unknown properties."] };
    }
    if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
      return { success: false as const, errors: ["componentId must be a non-empty string."] };
    }
    return { success: true as const, data: { componentId: input.componentId } };
  },
};

export interface AnnotateComponentInput {
  readonly componentId: string;
  readonly text: string;
  readonly tone?: AgentAnnotationTone;
}

const annotationToneSet = new Set<string>(["neutral", "question", "risk"]);

export const annotateComponentInputSchema: CapabilityInputSchema<AnnotateComponentInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      componentId: { type: "string", minLength: 1 },
      text: { type: "string", minLength: 1 },
    },
    required: ["componentId", "text"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) {
      return { success: false as const, errors: ["annotate_component input must be an object."] };
    }
    if (!hasOnlyKeys(input, ["componentId", "text", "tone"])) {
      return { success: false as const, errors: ["annotate_component input contains unknown properties."] };
    }
    if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
      return { success: false as const, errors: ["componentId must be a non-empty string."] };
    }
    if (typeof input.text !== "string" || input.text.trim().length === 0) {
      return { success: false as const, errors: ["text must be a non-empty string."] };
    }
    if (input.tone !== undefined && !annotationToneSet.has(String(input.tone))) {
      return { success: false as const, errors: ["tone must be neutral, question, or risk when provided."] };
    }
    return {
      success: true as const,
      data: {
        componentId: input.componentId,
        text: input.text,
        ...(input.tone !== undefined ? { tone: input.tone as AgentAnnotationTone } : {}),
      },
    };
  },
};

export interface HighlightConnectionInput {
  readonly connectionId: string;
  readonly label?: string;
}

export const highlightConnectionInputSchema: CapabilityInputSchema<HighlightConnectionInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      connectionId: { type: "string", minLength: 1 },
    },
    required: ["connectionId"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) {
      return { success: false as const, errors: ["highlight_connection input must be an object."] };
    }
    if (!hasOnlyKeys(input, ["connectionId", "label"])) {
      return { success: false as const, errors: ["highlight_connection input contains unknown properties."] };
    }
    if (typeof input.connectionId !== "string" || input.connectionId.trim().length === 0) {
      return { success: false as const, errors: ["connectionId must be a non-empty string."] };
    }
    if (input.label !== undefined && typeof input.label !== "string") {
      return { success: false as const, errors: ["label must be a string when provided."] };
    }
    return {
      success: true as const,
      data: {
        connectionId: input.connectionId,
        ...(input.label !== undefined ? { label: input.label } : {}),
      },
    };
  },
};

export type ClearAnnotationsScope = "all" | "component";

export interface ClearAnnotationsInput {
  readonly scope?: ClearAnnotationsScope;
  readonly componentId?: string;
}

export const clearAnnotationsInputSchema: CapabilityInputSchema<ClearAnnotationsInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      componentId: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (input === undefined || input === null) {
      return { success: true as const, data: {} };
    }
    if (!isRecord(input)) {
      return { success: false as const, errors: ["clear_annotations input must be an object."] };
    }
    if (!hasOnlyKeys(input, ["scope", "componentId"])) {
      return { success: false as const, errors: ["clear_annotations input contains unknown properties."] };
    }
    if (input.scope !== undefined && input.scope !== "all" && input.scope !== "component") {
      return { success: false as const, errors: ['scope must be "all" or "component" when provided.'] };
    }
    if (input.componentId !== undefined) {
      if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
        return { success: false as const, errors: ["componentId must be a non-empty string when provided."] };
      }
    }
    return {
      success: true as const,
      data: {
        ...(input.scope !== undefined ? { scope: input.scope as ClearAnnotationsScope } : {}),
        ...(input.componentId !== undefined ? { componentId: input.componentId } : {}),
      },
    };
  },
};
