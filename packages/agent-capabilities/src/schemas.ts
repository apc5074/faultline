import type { CapabilityInputSchema } from "./capability.js";

export interface RunLoadTestInput {
  readonly multiplier: 1.25 | 1.5 | 2 | 3 | 5;
}

const loadTestMultipliers = [1.25, 1.5, 2, 3, 5] as const;

/** Shared bounded load-test input; omission is normalized to the default multiplier. */
export const runLoadTestInputSchema: CapabilityInputSchema<RunLoadTestInput> = {
  jsonSchema: {
    type: "object",
    properties: { multiplier: { type: "number", enum: loadTestMultipliers } },
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (input === undefined || input === null) return { success: true as const, data: { multiplier: 2 as const } };
    if (!isRecord(input)) return { success: false as const, errors: ["run_load_test input must be an object."] };
    if (!hasOnlyKeys(input, ["multiplier"])) {
      return { success: false as const, errors: ["run_load_test input contains unknown properties."] };
    }
    if (input.multiplier === undefined) return { success: true as const, data: { multiplier: 2 as const } };
    if (typeof input.multiplier !== "number" || !loadTestMultipliers.includes(input.multiplier as (typeof loadTestMultipliers)[number])) {
      return { success: false as const, errors: ["multiplier must be one of 1.25, 1.5, 2, 3, or 5."] };
    }
    return { success: true as const, data: { multiplier: input.multiplier as RunLoadTestInput["multiplier"] } };
  },
};

export interface ChangeTrafficPatternInput {
  readonly hotKeyReadFraction: number;
}

/** Shared bounded hot-key input; the evaluator additionally compares it to the active baseline. */
export const changeTrafficPatternInputSchema: CapabilityInputSchema<ChangeTrafficPatternInput> = {
  jsonSchema: {
    type: "object",
    properties: { hotKeyReadFraction: { type: "number", minimum: 0, maximum: 1 } },
    required: ["hotKeyReadFraction"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) return { success: false as const, errors: ["change_traffic_pattern input must be an object."] };
    if (!hasOnlyKeys(input, ["hotKeyReadFraction"])) {
      return { success: false as const, errors: ["change_traffic_pattern input contains unknown properties."] };
    }
    if (
      typeof input.hotKeyReadFraction !== "number" ||
      !Number.isFinite(input.hotKeyReadFraction) ||
      input.hotKeyReadFraction < 0 ||
      input.hotKeyReadFraction > 1
    ) {
      return { success: false as const, errors: ["hotKeyReadFraction must be a finite number between 0 and 1."] };
    }
    return { success: true as const, data: { hotKeyReadFraction: input.hotKeyReadFraction } };
  },
};

export interface FlushCacheInput {
  readonly componentId: string;
}

/** Required cache selector shared by the flush-cache adapters. */
export const flushCacheInputSchema: CapabilityInputSchema<FlushCacheInput> = {
  jsonSchema: {
    type: "object",
    properties: { componentId: { type: "string", minLength: 1 } },
    required: ["componentId"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) return { success: false as const, errors: ["flush_cache input must be an object."] };
    if (!hasOnlyKeys(input, ["componentId"])) {
      return { success: false as const, errors: ["flush_cache input contains unknown properties."] };
    }
    if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
      return { success: false as const, errors: ["componentId must be a non-empty string."] };
    }
    return { success: true as const, data: { componentId: input.componentId } };
  },
};

/** Required Service selector shared by the component-failure adapters. */
export const injectComponentFailureInputSchema: CapabilityInputSchema<FlushCacheInput> = {
  jsonSchema: flushCacheInputSchema.jsonSchema,
  safeParse(input: unknown) {
    const parsed = flushCacheInputSchema.safeParse(input);
    return parsed.success
      ? parsed
      : { success: false as const, errors: parsed.errors.map((error) => error.replace(/^flush_cache/, "inject_component_failure")) };
  },
};

export interface InjectRegionFailureInput { readonly regionId: string; }

export const injectRegionFailureInputSchema: CapabilityInputSchema<InjectRegionFailureInput> = {
  jsonSchema: {
    type: "object",
    properties: { regionId: { type: "string", minLength: 1 } },
    required: ["regionId"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) return { success: false as const, errors: ["inject_region_failure input must be an object."] };
    if (!hasOnlyKeys(input, ["regionId"])) return { success: false as const, errors: ["inject_region_failure input contains unknown properties."] };
    if (typeof input.regionId !== "string" || input.regionId.trim().length === 0) return { success: false as const, errors: ["regionId must be a non-empty string."] };
    return { success: true as const, data: { regionId: input.regionId } };
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(input: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(input).every((key) => allowedKeys.includes(key));
}

/** Shared schema for read capabilities that take no tool arguments. */
export const noInputSchema: CapabilityInputSchema<undefined> = {
  jsonSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
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

export interface ReviewCurrentDesignInput {
  readonly intent?: "auto" | "component_review" | "requirement_failure" | "workload_trace" | "cost_review";
  readonly targetId?: string;
}

export const reviewCurrentDesignInputSchema: CapabilityInputSchema<ReviewCurrentDesignInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["auto", "component_review", "requirement_failure", "workload_trace", "cost_review"] },
      targetId: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  safeParse(input) {
    if (input === undefined || input === null) return { success: true as const, data: {} };
    if (!isRecord(input) || !hasOnlyKeys(input, ["intent", "targetId"])) return { success: false as const, errors: ["review_current_design input contains unknown properties."] };
    if (input.intent !== undefined && (typeof input.intent !== "string" || !["auto", "component_review", "requirement_failure", "workload_trace", "cost_review"].includes(input.intent))) return { success: false as const, errors: ["intent must be a supported review intent."] };
    if (input.targetId !== undefined && (typeof input.targetId !== "string" || input.targetId.trim().length === 0)) return { success: false as const, errors: ["targetId must be a non-empty string."] };
    return { success: true as const, data: { ...(input.intent ? { intent: input.intent as ReviewCurrentDesignInput["intent"] } : {}), ...(input.targetId ? { targetId: input.targetId } : {}) } };
  },
};

export interface InspectComponentInput {
  readonly componentId: string;
}

/** Runtime-validated input for inspect_component. */
export const inspectComponentInputSchema: CapabilityInputSchema<InspectComponentInput> = {
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
      return { success: false as const, errors: ["inspect_component input must be an object."] };
    }
    if (!hasOnlyKeys(input, ["componentId"])) {
      return { success: false as const, errors: ["inspect_component input contains unknown properties."] };
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

/** Optional componentId selector shared by architecture-scoped inspection tools. */
export type OptionalComponentIdInput = EstimateCapacityInput;

/** Optional componentId; omit / empty object selects the sole eligible resource when unambiguous. */
export const optionalComponentIdInputSchema: CapabilityInputSchema<OptionalComponentIdInput> = {
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
      return { success: false as const, errors: ["Input must be an object."] };
    }
    if (!hasOnlyKeys(input, ["componentId"])) {
      return { success: false as const, errors: ["Input contains unknown properties."] };
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

/** Optional componentId; omit / empty object = architecture-wide capacity summary. */
export const estimateCapacityInputSchema: CapabilityInputSchema<EstimateCapacityInput> = {
  jsonSchema: optionalComponentIdInputSchema.jsonSchema,
  safeParse(input: unknown) {
    const parsed = optionalComponentIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        errors: parsed.errors.map((error) => error.replace(/^Input/, "estimate_capacity input")),
      };
    }
    return parsed;
  },
};

export interface InspectCacheInput {
  readonly componentId?: string;
}

export interface InspectReplicationInput {
  readonly componentId?: string;
}

/** Runtime-validated input for inspect_replication. */
export const inspectReplicationInputSchema: CapabilityInputSchema<InspectReplicationInput> = {
  jsonSchema: optionalComponentIdInputSchema.jsonSchema,
  safeParse(input: unknown) {
    const parsed = optionalComponentIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        errors: parsed.errors.map((error) => error.replace(/^Input/, "inspect_replication input")),
      };
    }
    return parsed;
  },
};

/** Runtime-validated input for inspect_cache. */
export const inspectCacheInputSchema: CapabilityInputSchema<InspectCacheInput> = {
  jsonSchema: optionalComponentIdInputSchema.jsonSchema,
  safeParse(input: unknown) {
    const parsed = optionalComponentIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        errors: parsed.errors.map((error) => error.replace(/^Input/, "inspect_cache input")),
      };
    }
    return parsed;
  },
};
