/** Adapter-neutral modes that describe how a capability affects a challenge. */
export type AgentCapabilityMode = "read" | "experiment" | "visual";

export type CapabilityInputValidationResult<TInput> =
  | { success: true; data: TInput }
  | { success: false; errors: readonly string[] };

/** A schema boundary shared by future AI SDK and WebMCP adapters. */
export interface CapabilityInputSchema<TInput> {
  safeParse(input: unknown): CapabilityInputValidationResult<TInput>;
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
  execute(context: TContext, input: TInput): TOutput | Promise<TOutput>;
  annotations?: AgentCapabilityAnnotations;
}
