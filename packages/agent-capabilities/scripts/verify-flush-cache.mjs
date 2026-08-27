import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry, resolveExperimentCapabilities } from "../dist/index.js";

const challenge = {
  slug: "tiny-api", version: 1, title: "Tiny API", prompt: "Build a small API.", developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  coachingPolicy: { focusThemes: ["request flow"], prohibitedRevealCategories: ["canonical topology"] },
  requirements: [], monthlyBudget: 8_000,
  allowedComponentTypes: ["traffic-source", "service", "redis", "postgres"],
};
const architecture = {
  version: 1,
  components: [
    { id: "traffic-1", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-1", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "redis-1", type: "redis", config: { mode: "standalone", tier: "medium", ttlBand: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
    { id: "postgres-1", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 900, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-1", sourcePortId: "request_out", targetComponentId: "service-1", targetPortId: "request_in", type: "request" },
    { id: "service-redis", sourceComponentId: "service-1", sourcePortId: "database_out", targetComponentId: "redis-1", targetPortId: "cache_in", type: "read_write" },
    { id: "redis-postgres", sourceComponentId: "redis-1", sourcePortId: "origin_out", targetComponentId: "postgres-1", targetPortId: "database_in", type: "read_write" },
  ],
};
const context = { challenge, architecture, simulation: { available: true, components: {} } };
const registry = createDefaultCapabilityRegistry();
assert.deepEqual(resolveExperimentCapabilities(registry, context).names, ["run_load_test", "change_traffic_pattern", "flush_cache", "inject_component_failure"]);
const before = JSON.stringify({ architecture, challenge });
const result = await registry.invoke("flush_cache", context, { componentId: "redis-1" });
assert.equal(result.ok, true);
assert.equal(result.data.simulated, true);
assert.equal(result.data.parameters.componentId, "redis-1");
assert.equal(result.data.events[1].type, "cache_flushed");
assert.equal(result.data.events[1].data.observation, "cold_cache");
assert.equal(JSON.stringify({ architecture, challenge }), before);
for (const input of [{ componentId: "" }, { componentId: "missing" }, { componentId: "service-1" }, {}]) {
  const invalid = await registry.invoke("flush_cache", context, input);
  assert.equal(invalid.ok, false);
}
const noCache = resolveExperimentCapabilities(registry, {
  challenge,
  architecture: { ...architecture, components: architecture.components.filter((component) => component.type !== "redis") },
  simulation: { available: true, components: {} },
});
assert.deepEqual(noCache.skipped.find((skip) => skip.name === "flush_cache"), { name: "flush_cache", reason: "unavailable" });
console.log("flush_cache capability verification passed");
