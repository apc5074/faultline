import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

/**
 * Phase 2 config is intentionally empty of geography knobs.
 * Phase 3 will extend routing behavior without replacing this type.
 */
export interface GlobalRouterConfig extends JsonObject {}

const globalRouterConfigSchema: ComponentConfigSchema<GlobalRouterConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Global Router configuration must be an object."] };
    }

    // Reject premature geography knobs so Phase 2 stays honest.
    const record = input as Record<string, unknown>;
    for (const forbidden of ["regionId", "regions", "latencyBias", "failoverPolicy"]) {
      if (record[forbidden] !== undefined) {
        return {
          success: false,
          errors: [`Global Router does not accept "${forbidden}" until geographic routing is active.`],
        };
      }
    }

    return { success: true, data: {} };
  },
};

/**
 * Logical ingress/routing primitive for Level 1.
 *
 * Phase 2: deterministic request passthrough. Equal split across outbound
 * request edges. No nearest-region selection, no geographic latency, no
 * RegionRegistry dependency, zero monthly cost.
 *
 * Phase 3 will activate healthy-region routing on this same component type.
 */
export const globalRouterDefinition: ComponentDefinition<GlobalRouterConfig> = {
  type: "global-router",
  label: "Global Router",
  category: "Networking",
  defaultConfig: {},
  configSchema: globalRouterConfigSchema,
  ports: [
    {
      id: "request_in",
      label: "Requests",
      direction: "input",
      connectionTypes: ["request"],
    },
    {
      id: "route_out",
      label: "Route",
      direction: "output",
      connectionTypes: ["request"],
    },
  ],
  metrics: [
    { id: "incoming_requests_per_second", label: "Incoming requests/sec", unit: "requests/sec" },
    { id: "forwarded_requests_per_second", label: "Forwarded requests/sec", unit: "requests/sec" },
  ],
  simulation: {
    role: "global_router",
    forwardsRequests: true,
    geographicRouting: false,
    phase2Passthrough: true,
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
