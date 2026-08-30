import type { AgentCapabilityAnnotations } from "@faultline/agent-capabilities";

import type { WebMcpToolAnnotations } from "./types.js";

/**
 * Map reviewed, safe capability annotations onto WebMCP fields. A positive
 * destructive hint remains unexposed until a state-changing surface is added.
 */
export function toWebMcpAnnotations(
  annotations: AgentCapabilityAnnotations | undefined,
): WebMcpToolAnnotations | undefined {
  if (!annotations) return undefined;

  const mapped = {
    ...(annotations.readOnlyHint !== undefined ? { readOnlyHint: annotations.readOnlyHint } : {}),
    ...(typeof annotations.untrustedContentHint === "boolean" ? { untrustedContentHint: annotations.untrustedContentHint } : {}),
  } satisfies WebMcpToolAnnotations;

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}
