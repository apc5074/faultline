/** Adapter-neutral modes that describe how a capability affects a challenge. */
export type AgentCapabilityMode = "read" | "visual" | "session";

export type CapabilityInputValidationResult<TInput> =
  | { success: true; data: TInput }
  | { success: false; errors: readonly string[] };

/** Small adapter-neutral JSON Schema subset used to describe capability inputs. */
export interface CapabilityJsonSchema {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, CapabilityJsonSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface CapabilityJsonSchemaProperty {
  readonly type: "string" | "number";
  readonly minLength?: number;
  readonly enum?: readonly (string | number)[];
  readonly minimum?: number;
  readonly maximum?: number;
}

/** A schema boundary shared by future AI SDK and WebMCP adapters. */
export interface CapabilityInputSchema<TInput> {
  /** JSON Schema supplied directly to adapters; never reconstructed per adapter. */
  jsonSchema: CapabilityJsonSchema;
  safeParse(input: unknown): CapabilityInputValidationResult<TInput>;
}

import type { AgentSessionState } from "./session.js";
import type { InterviewService } from "./interview-service-port.js";

export type ProductionCapabilityGroup = "stable-review" | "stable-visual" | "specialists" | "stable-interview";

export interface ProductionCapabilityExposure {
  readonly production: boolean;
  readonly group: ProductionCapabilityGroup;
  readonly replaces?: readonly string[];
}

/** Adapter-neutral execution options forwarded from AI SDK, WebMCP, and other adapters. */
export interface CapabilityExecutionOptions {
  readonly signal?: AbortSignal;
  readonly session?: AgentSessionState;
  /** Current WebMCP surface revision for knownState comparisons. */
  readonly surfaceRevision?: string;
  /** Host-owned interview service; absent outside an interview-capable host. */
  readonly interviewService?: InterviewService;
}

/** Optional metadata for an adapter to communicate safe invocation semantics. */
export interface AgentCapabilityAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  [key: string]: boolean | string | undefined;
}

/**
 * Semantic operation contract. Business logic lives beneath adapters: an AI SDK
 * tool and a WebMCP tool will each call the same capability implementation.
 */
export interface AgentCapability<TContext, TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: CapabilityInputSchema<TInput>;
  mode: AgentCapabilityMode;
  availableWhen(context: TContext): boolean;
  execute(
    context: TContext,
    input: TInput,
    options?: CapabilityExecutionOptions,
  ): TOutput | Promise<TOutput>;
  annotations?: AgentCapabilityAnnotations;
  /** Adapter-neutral production exposure; browser registration behavior stays in WebMCP. */
  exposure?: ProductionCapabilityExposure;
}
