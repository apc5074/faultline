import type { CapabilityInputSchema } from "./capability.js";
import type { KnownStateInput } from "./evidence-result.js";

export type { KnownStateInput };

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

export interface InspectComponentOptionInput { readonly type?: string }

export const inspectComponentOptionInputSchema: CapabilityInputSchema<InspectComponentOptionInput> = {
  jsonSchema: {
    type: "object",
    properties: { type: { type: "string", minLength: 1 } },
    additionalProperties: false,
  },
  safeParse(input) {
    if (input === undefined || input === null) return { success: true as const, data: {} };
    if (!isRecord(input) || !hasOnlyKeys(input, ["type"])) return { success: false as const, errors: ["inspect_component_option input contains unknown properties."] };
    if (input.type !== undefined && (typeof input.type !== "string" || input.type.trim().length === 0)) return { success: false as const, errors: ["type must be a non-empty component type."] };
    return { success: true as const, data: input.type === undefined ? {} : { type: input.type } };
  },
};


export interface ReviewCurrentDesignInput {
  readonly intent?: "auto" | "component_review" | "requirement_failure" | "workload_trace" | "cost_review";
  readonly targetId?: string;
  /** @deprecated Prefer knownState.evidenceRevision */
  readonly knownEvidenceRevision?: string;
  readonly knownState?: KnownStateInput;
}

export const reviewCurrentDesignInputSchema: CapabilityInputSchema<ReviewCurrentDesignInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["auto", "component_review", "requirement_failure", "workload_trace", "cost_review"] },
      targetId: { type: "string", minLength: 1 },
      knownEvidenceRevision: { type: "string", minLength: 1 },
      knownState: {
        type: "object",
        properties: {
          evidenceRevision: { type: "string", minLength: 1 },
          sessionRevision: { type: "number" },
          surfaceRevision: { type: "string", minLength: 1 },
          resultDigest: { type: "string", minLength: 1 },
          requestFingerprint: { type: "string", minLength: 1 },
        },
        required: ["evidenceRevision", "sessionRevision", "surfaceRevision", "resultDigest"],
        additionalProperties: false,
      } as never,
    },
    additionalProperties: false,
  },
  safeParse(input) {
    if (input === undefined || input === null) return { success: true as const, data: {} };
    if (!isRecord(input) || !hasOnlyKeys(input, ["intent", "targetId", "knownEvidenceRevision", "knownState"])) return { success: false as const, errors: ["review_current_design input contains unknown properties."] };
    if (input.intent !== undefined && (typeof input.intent !== "string" || !["auto", "component_review", "requirement_failure", "workload_trace", "cost_review"].includes(input.intent))) return { success: false as const, errors: ["intent must be a supported review intent."] };
    if (input.targetId !== undefined && (typeof input.targetId !== "string" || input.targetId.trim().length === 0)) return { success: false as const, errors: ["targetId must be a non-empty string."] };
    if (input.knownEvidenceRevision !== undefined && (typeof input.knownEvidenceRevision !== "string" || input.knownEvidenceRevision.length === 0 || input.knownEvidenceRevision.length > 128)) return { success: false as const, errors: ["knownEvidenceRevision must be a bounded non-empty string."] };
    if (input.knownState !== undefined) {
      if (!isRecord(input.knownState) || !hasOnlyKeys(input.knownState, ["evidenceRevision", "sessionRevision", "surfaceRevision", "resultDigest", "requestFingerprint"])) return { success: false as const, errors: ["knownState contains unknown properties."] };
      if (typeof input.knownState.evidenceRevision !== "string" || input.knownState.evidenceRevision.length === 0) return { success: false as const, errors: ["knownState.evidenceRevision must be a non-empty string."] };
      if (typeof input.knownState.sessionRevision !== "number" || !Number.isFinite(input.knownState.sessionRevision)) return { success: false as const, errors: ["knownState.sessionRevision must be a finite number."] };
      if (typeof input.knownState.surfaceRevision !== "string" || input.knownState.surfaceRevision.length === 0) return { success: false as const, errors: ["knownState.surfaceRevision must be a non-empty string."] };
      if (typeof input.knownState.resultDigest !== "string" || input.knownState.resultDigest.length === 0) return { success: false as const, errors: ["knownState.resultDigest must be a non-empty string."] };
      if (input.knownState.requestFingerprint !== undefined && (typeof input.knownState.requestFingerprint !== "string" || input.knownState.requestFingerprint.length === 0 || input.knownState.requestFingerprint.length > 128)) return { success: false as const, errors: ["knownState.requestFingerprint must be a bounded non-empty string."] };
    }
    return { success: true as const, data: { ...(input.intent ? { intent: input.intent as ReviewCurrentDesignInput["intent"] } : {}), ...(input.targetId ? { targetId: input.targetId } : {}), ...(input.knownEvidenceRevision ? { knownEvidenceRevision: input.knownEvidenceRevision } : {}), ...(input.knownState ? { knownState: { evidenceRevision: String(input.knownState.evidenceRevision), sessionRevision: Number(input.knownState.sessionRevision), surfaceRevision: String(input.knownState.surfaceRevision), resultDigest: String(input.knownState.resultDigest), ...(input.knownState.requestFingerprint ? { requestFingerprint: String(input.knownState.requestFingerprint) } : {}) } } : {}) } };
  },
};

export type ReviewEvidenceSection = "causal_chain" | "topology_neighborhood" | "requirement_evidence" | "workload_hops" | "cost_contributors" | "comparison_baseline" | "experiment_readiness";
export interface ExpandDesignEvidenceInput { readonly reviewRef: string; readonly sections: readonly ReviewEvidenceSection[]; }
export const expandDesignEvidenceInputSchema: CapabilityInputSchema<ExpandDesignEvidenceInput> = {
  jsonSchema: { type: "object", properties: { reviewRef: { type: "string", minLength: 1 }, sections: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: ["causal_chain", "topology_neighborhood", "requirement_evidence", "workload_hops", "cost_contributors", "comparison_baseline", "experiment_readiness"] } } as never }, required: ["reviewRef", "sections"], additionalProperties: false },
  safeParse(input) {
    const allowed = ["causal_chain", "topology_neighborhood", "requirement_evidence", "workload_hops", "cost_contributors", "comparison_baseline", "experiment_readiness"];
    if (!isRecord(input) || !hasOnlyKeys(input, ["reviewRef", "sections"]) || typeof input.reviewRef !== "string" || input.reviewRef.length === 0 || !Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 2 || input.sections.some((section) => typeof section !== "string" || !allowed.includes(section))) return { success: false as const, errors: ["expand_design_evidence requires a reference and one or two supported sections."] };
    return { success: true as const, data: { reviewRef: input.reviewRef, sections: [...new Set(input.sections)] as ReviewEvidenceSection[] } };
  },
};

export type InspectDesignEntityKind = "component" | "connection" | "requirement" | "workload" | "region";

export type ComponentReference = { readonly componentId: string } | ComponentSelector;

export type InspectDesignEntityInput =
  | { readonly kind: InspectDesignEntityKind; readonly ref: string }
  | { readonly kind: "connection"; readonly endpoints: { readonly source: ComponentReference; readonly target: ComponentReference } }
  | { readonly kind: "workload"; readonly selector: { readonly scope: "named" | "default"; readonly channelId?: string } };

const inspectDesignEntityKinds = ["component", "connection", "requirement", "workload", "region"] as const;

export const inspectDesignEntityInputSchema: CapabilityInputSchema<InspectDesignEntityInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...inspectDesignEntityKinds] },
      ref: { type: "string", minLength: 1 },
      endpoints: {
        type: "object",
        properties: {
          source: { type: "object" },
          target: { type: "object" },
        },
        required: ["source", "target"],
        additionalProperties: false,
      } as never,
      selector: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["named", "default"] },
          channelId: { type: "string", minLength: 1 },
        },
        required: ["scope"],
        additionalProperties: false,
      } as never,
    },
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) return { success: false as const, errors: ["inspect_design_entity input must be an object."] };
    if (typeof input.kind !== "string" || !inspectDesignEntityKinds.includes(input.kind as InspectDesignEntityKind)) {
      return { success: false as const, errors: ["kind must be component, connection, requirement, workload, or region."] };
    }

    if (input.kind === "connection" && input.endpoints !== undefined) {
      if (!hasOnlyKeys(input, ["kind", "endpoints"]) || !isRecord(input.endpoints)) return { success: false as const, errors: ["endpoints must contain source and target component selectors."] };
      const source = input.endpoints.source;
      const target = input.endpoints.target;
      for (const endpointName of ["source", "target"] as const) {
        const endpoint = endpointName === "source" ? source : target;
        if (!isRecord(endpoint) || !hasOnlyKeys(endpoint, ["componentId", "type", "scope"])) return { success: false as const, errors: [`endpoints.${endpointName} is invalid.`] };
        const exactId = endpoint.componentId;
        const typed = endpoint.type;
        if (exactId !== undefined && (typeof exactId !== "string" || exactId.trim().length === 0 || endpoint.type !== undefined || endpoint.scope !== undefined)) return { success: false as const, errors: [`endpoints.${endpointName}.componentId must be a non-empty canonical ID.`] };
        if (exactId === undefined && (!isComponentType(typed) || (endpoint.scope !== "all" && endpoint.scope !== "topmost"))) return { success: false as const, errors: [`endpoints.${endpointName} must use componentId or an exact type with scope all or topmost.`] };
      }
      const sourceRecord = source as Record<string, unknown>;
      const targetRecord = target as Record<string, unknown>;
      return {
        success: true as const,
        data: {
          kind: "connection",
          endpoints: {
            source: "componentId" in sourceRecord ? { componentId: String(sourceRecord.componentId) } : { type: sourceRecord.type as ComponentType, scope: sourceRecord.scope as ComponentSelectorScope },
            target: "componentId" in targetRecord ? { componentId: String(targetRecord.componentId) } : { type: targetRecord.type as ComponentType, scope: targetRecord.scope as ComponentSelectorScope },
          },
        },
      };
    }

    if (input.kind === "workload" && input.selector !== undefined) {
      if (!hasOnlyKeys(input, ["kind", "selector"]) || !isRecord(input.selector)) return { success: false as const, errors: ["selector must contain workload scope and optional channelId."] };
      if (input.selector.scope !== "named" && input.selector.scope !== "default") return { success: false as const, errors: ["selector.scope must be named or default."] };
      if (input.selector.scope === "named" && (typeof input.selector.channelId !== "string" || input.selector.channelId.trim().length === 0)) return { success: false as const, errors: ["named workload selectors require a non-empty channelId."] };
      if (input.selector.channelId !== undefined && (typeof input.selector.channelId !== "string" || input.selector.channelId.trim().length === 0)) return { success: false as const, errors: ["channelId must be a non-empty string."] };
      return { success: true as const, data: { kind: "workload", selector: { scope: input.selector.scope, ...(input.selector.channelId ? { channelId: input.selector.channelId } : {}) } } };
    }

    if (!hasOnlyKeys(input, ["kind", "ref"])) return { success: false as const, errors: ["inspect_design_entity input contains unknown properties."] };
    if (typeof input.ref !== "string" || input.ref.trim().length === 0) {
      return { success: false as const, errors: ["ref must be a non-empty entity id or scoped reference."] };
    }
    return { success: true as const, data: { kind: input.kind as InspectDesignEntityKind, ref: input.ref } };
  },
};

export type CompareDesignEvidenceScope = "system" | "entity" | "requirement" | "workload" | "cost";

export interface CompareDesignEvidenceInput {
  readonly baseline: "previous_review" | "last_player_run" | "authored_scenario";
  readonly scenarioId?: "hot_key" | "processing" | "playback";
  readonly scope?: CompareDesignEvidenceScope;
  readonly targetRef?: string;
}

const compareScenarioIds = ["hot_key", "processing", "playback"] as const;
const compareScopes = ["system", "entity", "requirement", "workload", "cost"] as const;

export const compareDesignEvidenceInputSchema: CapabilityInputSchema<CompareDesignEvidenceInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      baseline: { type: "string", enum: ["previous_review", "last_player_run", "authored_scenario"] },
      scenarioId: { type: "string", enum: [...compareScenarioIds] },
      scope: { type: "string", enum: [...compareScopes] },
      targetRef: { type: "string", minLength: 1 },
    },
    required: ["baseline"],
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) return { success: false as const, errors: ["compare_design_evidence input must be an object."] };
    if (!hasOnlyKeys(input, ["baseline", "scenarioId", "scope", "targetRef"])) return { success: false as const, errors: ["compare_design_evidence input contains unknown properties."] };
    if (typeof input.baseline !== "string" || !["previous_review", "last_player_run", "authored_scenario"].includes(input.baseline)) {
      return { success: false as const, errors: ["baseline must be previous_review, last_player_run, or authored_scenario."] };
    }
    if (input.scenarioId !== undefined && (typeof input.scenarioId !== "string" || !compareScenarioIds.includes(input.scenarioId as typeof compareScenarioIds[number]))) {
      return { success: false as const, errors: ["scenarioId must be hot_key, processing, or playback."] };
    }
    if (input.baseline === "authored_scenario" && input.scenarioId === undefined) {
      return { success: false as const, errors: ["authored_scenario requires scenarioId."] };
    }
    if (input.scope !== undefined && (typeof input.scope !== "string" || !compareScopes.includes(input.scope as typeof compareScopes[number]))) {
      return { success: false as const, errors: ["scope must be system, entity, requirement, workload, or cost."] };
    }
    if (input.targetRef !== undefined && (typeof input.targetRef !== "string" || input.targetRef.trim().length === 0)) {
      return { success: false as const, errors: ["targetRef must be a non-empty string."] };
    }
    if (input.scope === "entity" && !input.targetRef) {
      return { success: false as const, errors: ["entity scope requires targetRef."] };
    }
    return {
      success: true as const,
      data: {
        baseline: input.baseline as CompareDesignEvidenceInput["baseline"],
        ...(input.scenarioId ? { scenarioId: input.scenarioId as CompareDesignEvidenceInput["scenarioId"] } : {}),
        ...(input.scope ? { scope: input.scope as CompareDesignEvidenceScope } : {}),
        ...(input.targetRef ? { targetRef: input.targetRef } : {}),
      },
    };
  },
};

export const componentTypes = [
  "traffic-source",
  "service",
  "postgres",
  "redis",
  "global-router",
  "load-balancer",
  "cdn",
  "object-storage",
  "queue",
  "worker",
] as const;

export type ComponentType = (typeof componentTypes)[number];
export type ComponentSelectorScope = "all" | "topmost";

export interface ComponentSelector {
  readonly type: ComponentType;
  readonly scope: ComponentSelectorScope;
}

export type InspectComponentInput =
  | { readonly componentId: string }
  | { readonly selector: ComponentSelector };

function isComponentType(value: unknown): value is ComponentType {
  return typeof value === "string" && componentTypes.includes(value as ComponentType);
}

function parseInspectComponentTarget(input: Record<string, unknown>): { success: true; data: InspectComponentInput } | { success: false; errors: string[] } {
  if (input.componentId !== undefined) {
    if (!hasOnlyKeys(input, ["componentId"])) {
      return { success: false, errors: ["inspect_component input contains unknown properties."] };
    }
    if (typeof input.componentId !== "string" || input.componentId.trim().length === 0) {
      return { success: false, errors: ["componentId must be a non-empty string or scoped entity reference."] };
    }
    return { success: true, data: { componentId: input.componentId } };
  }
  if (input.selector !== undefined) {
    if (!hasOnlyKeys(input, ["selector"]) || !isRecord(input.selector)) {
      return { success: false, errors: ["selector must contain an exact component type and scope."] };
    }
    if (!hasOnlyKeys(input.selector, ["type", "scope"])) {
      return { success: false, errors: ["selector contains unknown properties."] };
    }
    if (!isComponentType(input.selector.type)) {
      return { success: false, errors: ["selector.type must be an exact registered component type."] };
    }
    if (input.selector.scope !== "all" && input.selector.scope !== "topmost") {
      return { success: false, errors: ["selector.scope must be all or topmost."] };
    }
    return { success: true, data: { selector: { type: input.selector.type, scope: input.selector.scope } } };
  }
  return { success: false, errors: ["inspect_component requires componentId or selector."] };
}

/** Runtime-validated input for inspect_component. Accepts canonical IDs or WMP-2 scoped references. */
export const inspectComponentInputSchema: CapabilityInputSchema<InspectComponentInput> = {
  jsonSchema: {
    type: "object",
    properties: {
      componentId: { type: "string", minLength: 1 },
      selector: {
        type: "object",
        properties: {
          type: { type: "string", enum: componentTypes },
          scope: { type: "string", enum: ["all", "topmost"] },
        },
        required: ["type", "scope"],
        additionalProperties: false,
      } as never,
    },
    additionalProperties: false,
  },
  safeParse(input: unknown) {
    if (!isRecord(input)) {
      return { success: false as const, errors: ["inspect_component input must be an object."] };
    }
    return parseInspectComponentTarget(input);
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
