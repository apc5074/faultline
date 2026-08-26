import type { AgentCapabilityMode, AgentCapabilityRegistry, CapabilityJsonSchema } from "@faultline/agent-capabilities";

import { getWebMcpModelContext } from "./model-context.js";
import {
  buildPhase6ReadSurface,
  PHASE_6_READ_CAPABILITY_NAMES,
  type Phase6ReadSurfaceSkipReason,
} from "./phase6-read-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool, WebMcpToolAnnotations } from "./types.js";

export type WebMcpRegistrationState = "unsupported" | "registered" | "rejected";

export interface Phase6InspectorEntry {
  readonly name: string;
  readonly description: string;
  readonly mode: AgentCapabilityMode;
  readonly available: boolean;
  readonly inputSchema: CapabilityJsonSchema;
  readonly annotations?: WebMcpToolAnnotations;
  readonly registrationState: WebMcpRegistrationState | "skipped";
  readonly skipReason?: Phase6ReadSurfaceSkipReason;
}

export interface Phase6InspectorSnapshot {
  readonly browserSupported: boolean;
  readonly entries: readonly Phase6InspectorEntry[];
  readonly tools: readonly WebMcpTool[];
}

export interface BuildPhase6InspectorSnapshotOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly development?: boolean;
}

async function probeToolRegistration(
  tool: WebMcpTool,
): Promise<Exclude<WebMcpRegistrationState, "unsupported">> {
  const modelContext = getWebMcpModelContext();
  if (!modelContext) return "rejected";

  const controller = new AbortController();
  try {
    await modelContext.registerTool(tool, { signal: controller.signal });
    return "registered";
  } catch {
    return "rejected";
  } finally {
    controller.abort();
  }
}

/** Build a development inspector snapshot from the real Phase 6 surface builder. */
export async function buildPhase6InspectorSnapshot(
  options: BuildPhase6InspectorSnapshotOptions,
): Promise<Phase6InspectorSnapshot> {
  const { registry, getContext, development = true } = options;
  const browserSupported = getWebMcpModelContext() !== undefined;
  const context = await getContext();
  const surface = await buildPhase6ReadSurface({ registry, getContext, development });
  const toolsByName = new Map(surface.tools.map((tool) => [tool.name, tool]));
  const skippedByName = new Map(surface.skipped.map((skip) => [skip.name, skip.reason]));
  const entries: Phase6InspectorEntry[] = [];

  for (const name of PHASE_6_READ_CAPABILITY_NAMES) {
    const skipReason = skippedByName.get(name);
    if (skipReason) {
      const capability = registry.has(name) ? registry.get(name) : undefined;
      entries.push({
        name,
        description: capability?.description ?? "Unavailable on the current surface.",
        mode: capability?.mode ?? "read",
        available: capability ? capability.availableWhen(context) : false,
        inputSchema: capability?.inputSchema.jsonSchema ?? { type: "object", additionalProperties: false },
        annotations: capability ? toolsByName.get(name)?.annotations : undefined,
        registrationState: "skipped",
        skipReason,
      });
      continue;
    }

    const tool = toolsByName.get(name);
    const capability = registry.get(name);
    if (!tool) continue;

    const registrationState: WebMcpRegistrationState | "skipped" = browserSupported
      ? await probeToolRegistration(tool)
      : "unsupported";

    entries.push({
      name,
      description: tool.description,
      mode: capability.mode,
      available: capability.availableWhen(context),
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      registrationState,
    });
  }

  return {
    browserSupported,
    entries,
    tools: surface.tools,
  };
}

/** Invoke one adapted Phase 6 tool through the same WebMCP execute path used in production. */
export async function invokePhase6InspectorTool(
  snapshot: Phase6InspectorSnapshot,
  toolName: string,
  input: unknown,
): Promise<unknown> {
  const tool = snapshot.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`Unknown Phase 6 tool "${toolName}".`);
  }
  return tool.execute(input, {});
}
