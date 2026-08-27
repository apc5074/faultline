import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry, resolveExperimentCapabilities } from "../dist/index.js";

const challenge = {
  slug: "tiny-api", version: 1, title: "Tiny API", prompt: "Build a small API.", developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 }, requirements: [], monthlyBudget: 8_000,
  allowedComponentTypes: ["traffic-source", "service", "postgres"],
};
const architecture = {
  version: 1,
  components: [
    { id: "traffic-1", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-1", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-1", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-1", sourcePortId: "request_out", targetComponentId: "service-1", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-1", sourcePortId: "database_out", targetComponentId: "postgres-1", targetPortId: "database_in", type: "read_write" },
  ],
};
const context = { challenge, architecture, simulation: { available: true, components: {} } };
const registry = createDefaultCapabilityRegistry();
assert.deepEqual(resolveExperimentCapabilities(registry, context).names, ["run_load_test", "change_traffic_pattern", "inject_component_failure"]);
const before = JSON.stringify({ architecture, challenge });
const result = await registry.invoke("inject_component_failure", context, { componentId: "service-1" });
assert.equal(result.ok, true);
assert.equal(result.data.simulated, true);
assert.equal(result.data.parameters.componentId, "service-1");
assert.equal(result.data.events[1].type, "component_failed");
assert.ok(result.data.events.some((event) => event.type === "unroutable_demand"));
assert.equal(JSON.stringify({ architecture, challenge }), before);
const unsupported = await registry.invoke("inject_component_failure", context, { componentId: "postgres-1" });
assert.deepEqual(unsupported, { ok: false, code: "NOT_FOUND", message: "component_failure target must be an existing Service component on a simulated request path." });
console.log("inject_component_failure capability verification passed");
