import type { CapabilityJsonSchema } from "@faultline/agent-capabilities";

/** Browser WebMCP execution context supplied to a registered tool callback. */
export interface WebMcpToolExecutionContext {
  readonly signal?: AbortSignal;
}

/** Supported WebMCP tool safety annotations mapped from semantic capabilities. */
export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
}

/** Browser WebMCP tool definition registered through document.modelContext. */
export interface WebMcpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: CapabilityJsonSchema;
  readonly annotations?: WebMcpToolAnnotations;
  readonly execute: (
    input: unknown,
    context: WebMcpToolExecutionContext,
  ) => unknown | Promise<unknown>;
}

/** Minimal document.modelContext surface used by the Faultline WebMCP adapter. */
export interface WebMcpModelContext {
  registerTool(tool: WebMcpTool, options: { signal: AbortSignal }): Promise<void>;
}
