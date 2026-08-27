import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry, resolveExperimentCapabilities } from "../dist/index.js";

const challenge = {
  slug: "tiny-api", version: 1, title: "Tiny API", prompt: "Build a small API.", developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  coachingPolicy: { focusThemes: ["request flow"], prohibitedRevealCategories: ["canonical topology"] },
  requirements: [
    { id: "throughput", label: "Throughput", type: "throughput", comparator: "gte", target: 1, unit: "ratio" },
    { id: "latency", label: "p95 latency", type: "latency", comparator: "lt", target: 200, unit: "ms" },
    { id: "headroom", label: "Capacity headroom", type: "headroom", comparator: "gte", target: 0.2, unit: "ratio" },
    { id: "budget", label: "Monthly infrastructure budget", type: "budget", comparator: "lte", target: 8_000, unit: "usd/month" },
  ],
  monthlyBudget: 8_000, allowedComponentTypes: ["traffic-source", "service", "postgres"],
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
const result = await registry.invoke("change_traffic_pattern", context, { hotKeyReadFraction: 0.25 });
assert.equal(result.ok, true);
assert.equal(result.data.simulated, true);
assert.equal(result.data.parameters.hotKeyReadFraction, 0.25);
assert.equal(result.data.outcome.hotKey.active, true);
assert.equal(result.data.outcome.hotKey.viralRedirectRps, 6_000 * 0.9 * 0.25);
assert.equal(JSON.stringify({ architecture, challenge }), before);
for (const value of [-0.1, 1.01, "0.5"]) {
  const invalid = await registry.invoke("change_traffic_pattern", context, { hotKeyReadFraction: value });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "INVALID_INPUT");
}
const duplicate = await registry.invoke("change_traffic_pattern", {
  ...context,
  challenge: { ...challenge, workload: { ...challenge.workload, hotKeyReadFraction: 0.25 } },
}, { hotKeyReadFraction: 0.25 });
assert.deepEqual(duplicate, {
  ok: false,
  code: "INVALID_INPUT",
  message: "hot_key hotKeyReadFraction must exceed the challenge baseline fraction.",
});
console.log("change_traffic_pattern capability verification passed");
