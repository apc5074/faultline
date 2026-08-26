import type { AgentCapabilityAnnotations } from "@faultline/agent-capabilities";

import type { WebMcpToolAnnotations } from "./types.js";

/**
 * Map shared read-only capability annotations onto supported WebMCP fields.
 * Unknown or state-changing annotations stay unexposed until explicitly reviewed.
 */
export function toWebMcpAnnotations(
  annotations: AgentCapabilityAnnotations | undefined,
): WebMcpToolAnnotations | undefined {
  if (!annotations) return undefined;

  const mapped = {
    ...(annotations.readOnlyHint !== undefined ? { readOnlyHint: annotations.readOnlyHint } : {}),
    ...(annotations.idempotentHint !== undefined ? { idempotentHint: annotations.idempotentHint } : {}),
  } satisfies WebMcpToolAnnotations;

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}
