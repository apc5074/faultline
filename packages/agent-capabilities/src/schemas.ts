import type { CapabilityInputSchema } from "./capability.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shared schema for read capabilities that take no tool arguments. */
export const noInputSchema: CapabilityInputSchema<undefined> = {
  safeParse(input: unknown) {
    if (input === undefined || input === null) {
      return { success: true as const, data: undefined };
    }
    if (isRecord(input) && Object.keys(input).length === 0) {
      return { success: true as const, data: undefined };
    }
    return { success: false as const, errors: ["This capability accepts no input."] };
  },
};

export interface InspectComponentInput {
  readonly componentId: string;
}

/** Runtime-validated input for inspect_component. */
export const inspectComponentInputSchema: CapabilityInputSchema<InspectComponentInput> = {
  safeParse(input: unknown) {
    if (!isRecord(input)) {
      return { success: false as const, errors: ["inspect_component input must be an object."] };
    }
    if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
      return { success: false as const, errors: ["componentId must be a non-empty string."] };
    }
    return { success: true as const, data: { componentId: input.componentId } };
  },
};

export interface EstimateCapacityInput {
  readonly componentId?: string;
}

/** Optional componentId; omit / empty object = architecture-wide capacity summary. */
export const estimateCapacityInputSchema: CapabilityInputSchema<EstimateCapacityInput> = {
  safeParse(input: unknown) {
    if (input === undefined || input === null) {
      return { success: true as const, data: {} };
    }
    if (!isRecord(input)) {
      return { success: false as const, errors: ["estimate_capacity input must be an object."] };
    }
    if (input.componentId === undefined) {
      return { success: true as const, data: {} };
    }
    if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
      return { success: false as const, errors: ["componentId must be a non-empty string when provided."] };
    }
    return { success: true as const, data: { componentId: input.componentId } };
  },
};
