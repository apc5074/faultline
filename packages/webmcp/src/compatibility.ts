import type { WebMcpModelContext } from "./types.js";

export interface WebMcpCompatibilityReport {
  readonly standardRegistration: boolean;
  readonly supportsTitles: true;
  readonly supportsStandardAnnotations: true;
  readonly futureOutputSchemaEnabled: false;
}

/** Feature probe for diagnostics. Production registration only requires registerTool. */
export function probeWebMcpCompatibility(modelContext: Partial<WebMcpModelContext>): WebMcpCompatibilityReport {
  return {
    standardRegistration: typeof modelContext.registerTool === "function",
    supportsTitles: true,
    supportsStandardAnnotations: true,
    futureOutputSchemaEnabled: false,
  };
}
