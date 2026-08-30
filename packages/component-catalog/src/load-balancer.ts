import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const loadBalancerPolicies = ["equal", "capacity_weighted"] as const;
export type LoadBalancerPolicy = (typeof loadBalancerPolicies)[number];

/** Non-zero educational monthly cost so an LB is a real budget tradeoff. */
export const loadBalancerMonthlyCost = 500;

export interface LoadBalancerConfig extends JsonObject {
  policy: LoadBalancerPolicy;
}

function isLoadBalancerPolicy(value: unknown): value is LoadBalancerPolicy {
  return typeof value === "string" && (loadBalancerPolicies as readonly string[]).includes(value);
}

const loadBalancerConfigSchema: ComponentConfigSchema<LoadBalancerConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Load Balancer policy must be equal or capacity_weighted."] };
    }

    const policy = (input as Record<string, unknown>).policy;
    if (!isLoadBalancerPolicy(policy)) {
      return { success: false, errors: ["Load Balancer policy must be equal or capacity_weighted."] };
    }

    return { success: true, data: { policy } };
  },
};

/**
 * Logical request distribution across downstream Service components.
 *
 * Phase 2 policies:
 * - `equal` — split request RPS evenly across outbound request edges
 * - `capacity_weighted` — split proportional to each Service target's
 *   configured capacity (`instances × capacity_per_size`)
 *
 * All connected targets are treated as healthy. Future failure injection should
 * exclude failed Service targets and redistribute remaining load (may saturate);
 * that behavior is not implemented or faked here.
 */
export const loadBalancerDefinition: ComponentDefinition<LoadBalancerConfig> = {
  type: "load-balancer",
  label: "Load Balancer",
  category: "Networking",
  defaultConfig: { policy: "equal" },
  configSchema: loadBalancerConfigSchema,
  ports: [
    {
      id: "request_in",
      label: "Requests",
      direction: "input",
      connectionTypes: ["request"],
    },
    {
      id: "request_out",
      label: "Requests",
      direction: "output",
      connectionTypes: ["request"],
    },
  ],
  metrics: [
    { id: "incoming_requests_per_second", label: "Incoming requests/sec", unit: "requests/sec" },
    { id: "forwarded_requests_per_second", label: "Forwarded requests/sec", unit: "requests/sec" },
  ],
  presentation: {
    glyph: "load_balancer",
    size: "standard",
    visualConfig: [{ name: "policy", source: "config", path: "policy" }],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    role: "load_balancer",
    forwardsRequests: true,
    distributionPolicies: loadBalancerPolicies as unknown as JsonObject,
    failureAwareExclusion: false,
    failureAwareExclusionExtensionPoint:
      "When component failure exists, failed Service targets receive zero traffic and remaining healthy targets absorb the load.",
  },
  cost: {
    fixedMonthlyCost: loadBalancerMonthlyCost,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  agentFacts: {
    configFields: [{ key: "policy", label: "Policy", valueType: "string", options: [...loadBalancerPolicies], defaultValue: "equal" }],
    costInputs: [], modeledBehaviors: ["request fanout", "capacity-weighted request distribution"], unmodeledBehaviors: ["connection draining", "session affinity"], compatibleConnectionRoles: ["request"],
    placementConstraints: ["Distributes requests to connected service paths."], learningThemes: ["request distribution", "capacity-aware routing"],
  },
  schemaVersion: 1,
};
