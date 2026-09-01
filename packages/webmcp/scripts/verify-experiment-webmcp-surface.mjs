import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildExperimentWebMcpSurface } from "../dist/index.js";

const context = {
  challenge: { slug: "tiny-api", version: 1, title: "Tiny API", prompt: "Design", developmentOnly: true, workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 100, allowedComponentTypes: ["service"] },
  architecture: { version: 1, components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }], connections: [] },
  simulation: { available: true, components: {} },
};
const registry = createDefaultCapabilityRegistry();
const surface = await buildExperimentWebMcpSurface({ registry, getContext: () => context, development: true });
assert.deepEqual(surface.resolvedNames, ["run_load_test", "change_traffic_pattern", "inject_component_failure"]);
assert.deepEqual(surface.tools.map((tool) => tool.name), surface.resolvedNames);
console.log("verify-experiment-webmcp-surface: ok");
