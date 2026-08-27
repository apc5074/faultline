import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry, resolveExperimentCapabilities } from "../dist/index.js";

const challenge = { slug: "tiny-api", version: 1, title: "Tiny API", prompt: "Design", developmentOnly: true,
  workload: { requestsPerSecond: 100, readRatio: 0.9, writeRatio: 0.1 }, requirements: [], monthlyBudget: 1000,
  allowedComponentTypes: ["service"] };
const architecture = { version: 1, components: [
  { id: "service-1", type: "service", config: { instances: 2 }, deployments: [
    { id: "east", regionId: "us-east", config: { instances: 1 } },
    { id: "europe", regionId: "europe", config: { instances: 1 } },
  ], ui: { x: 0, y: 0 } },
], connections: [] };
const context = { challenge, architecture, simulation: { available: true, components: {}, regional: { active: true } } };
const registry = createDefaultCapabilityRegistry();
assert.ok(resolveExperimentCapabilities(registry, context).names.includes("inject_region_failure"));
const invalid = await registry.invoke("inject_region_failure", context, { regionId: "atlantis" });
assert.equal(invalid.ok, false);
assert.equal(invalid.code, "NOT_FOUND");
const logical = resolveExperimentCapabilities(registry, {
  challenge, architecture: { ...architecture, components: architecture.components.map((c) => ({ ...c, deployments: [] })) },
  simulation: { available: true, components: {} },
});
assert.deepEqual(logical.skipped.at(-1), { name: "inject_region_failure", reason: "unavailable" });
console.log("inject_region_failure capability verification passed");
