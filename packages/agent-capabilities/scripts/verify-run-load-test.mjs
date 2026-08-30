import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry, createEmptyAgentSessionState, grantExperimentConsent, resolveExperimentCapabilities } from "../dist/index.js";

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
const denied = await registry.invoke("run_load_test", context, {}, { session: createEmptyAgentSessionState() });
assert.equal(denied.ok, false);
assert.equal(denied.code, "CONSENT_REQUIRED");
assert.match(denied.message, /Human approval is required/);
assert.equal(denied.recovery?.requiresUserAction, "approve_exact_experiment");
const consentedSession = {
  ...createEmptyAgentSessionState(),
  experimentConsent: grantExperimentConsent(context, "run_load_test"),
};
const consented = await registry.invoke("run_load_test", context, {}, { session: consentedSession });
assert.equal(consented.ok, true);
const defaultResult = await registry.invoke("run_load_test", context, {});
assert.equal(defaultResult.ok, true);
assert.equal(defaultResult.data.simulated, true);
assert.equal(defaultResult.data.parameters.multiplier, 2);
assert.equal(JSON.stringify({ architecture, challenge }), before);
const invalid = await registry.invoke("run_load_test", context, { multiplier: 4 });
assert.equal(invalid.ok, false);
assert.equal(invalid.code, "INVALID_INPUT");
assert.match(invalid.message, /multiplier must be one of/);
const unavailable = resolveExperimentCapabilities(registry, { challenge, architecture, simulation: { available: false } });
assert.deepEqual(unavailable.skipped, [
  { name: "run_load_test", reason: "unavailable" },
  { name: "change_traffic_pattern", reason: "unavailable" },
  { name: "flush_cache", reason: "unavailable" },
  { name: "inject_component_failure", reason: "unavailable" },
  { name: "inject_region_failure", reason: "unavailable" },
  { name: "slow_consumers", reason: "unavailable" },
]);
console.log("run_load_test capability verification passed");
