import type { CapabilityJsonSchema } from "@faultline/agent-capabilities";
import type { LiveAgentSnapshot } from "@faultline/agent-capabilities";

/** One coherent, revision-bound read of the live page state. */
export interface WebMcpEvidenceLease {
  readonly snapshot: LiveAgentSnapshot;
  readonly evidenceRevision: string;
  readonly surfaceRevision: string;
  readonly sessionRevision: number;
  isCurrent(): boolean;
}

/** Browser WebMCP execution context supplied to a registered tool callback. */
export interface WebMcpToolExecutionContext {
  readonly signal?: AbortSignal;
}

/** Supported WebMCP tool safety annotations mapped from semantic capabilities. */
export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
}

/** Browser WebMCP tool definition registered through document.modelContext. */
export interface WebMcpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: CapabilityJsonSchema;
  readonly annotations?: WebMcpToolAnnotations;
  readonly execute: (
    input: unknown,
    context: WebMcpToolExecutionContext,
  ) => unknown | Promise<unknown>;
}

/** Registration options supported by the Phase 6 adapter. Cross-origin exposure is intentionally omitted. */
export interface WebMcpRegisterToolOptions {
  readonly signal: AbortSignal;
}

/** Minimal document.modelContext surface used by the Faultline WebMCP adapter. */
export interface WebMcpModelContext {
  registerTool(tool: WebMcpTool, options: WebMcpRegisterToolOptions): Promise<void>;
}
