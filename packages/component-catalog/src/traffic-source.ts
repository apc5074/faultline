import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export interface TrafficSourceConfig extends JsonObject {
  label: string;
}

const trafficSourceConfigSchema: ComponentConfigSchema<TrafficSourceConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Traffic Source label must be a non-empty string."] };
    }

    const label = (input as Record<string, unknown>).label;
    if (typeof label !== "string" || label.trim().length === 0) {
      return { success: false, errors: ["Traffic Source label must be a non-empty string."] };
    }

    return { success: true, data: { label } };
  },
};

/**
 * The challenge-owned workload enters the architecture through this source.
 * It has no player-controlled capacity, infrastructure cost, or geography behavior.
 */
export const trafficSourceDefinition: ComponentDefinition<TrafficSourceConfig> = {
  type: "traffic-source",
  label: "Traffic Source",
  category: "Traffic",
  defaultConfig: { label: "Incoming traffic" },
  configSchema: trafficSourceConfigSchema,
  ports: [
    {
      id: "request_out",
      label: "Requests",
      direction: "output",
      connectionTypes: ["request"],
    },
  ],
  metrics: [
    {
      id: "outgoing_requests_per_second",
      label: "Outgoing requests/sec",
      unit: "requests/sec",
    },
  ],
  presentation: {
    glyph: "user",
    size: "standard",
    visualConfig: [],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    injectsChallengeWorkload: true,
  },
  cost: {
    fixedMonthlyCost: 0,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
