import type { AgentCapabilityAnnotations } from "@faultline/agent-capabilities";

import type { WebMcpToolAnnotations } from "./types.js";

/** Map shared capability annotations onto the supported WebMCP annotation fields. */
export function toWebMcpAnnotations(
  annotations: AgentCapabilityAnnotations | undefined,
): WebMcpToolAnnotations | undefined {
  if (!annotations) return undefined;

  const mapped = {
    ...(annotations.readOnlyHint !== undefined ? { readOnlyHint: annotations.readOnlyHint } : {}),
    ...(annotations.destructiveHint !== undefined ? { destructiveHint: annotations.destructiveHint } : {}),
    ...(annotations.idempotentHint !== undefined ? { idempotentHint: annotations.idempotentHint } : {}),
  } satisfies WebMcpToolAnnotations;

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}
