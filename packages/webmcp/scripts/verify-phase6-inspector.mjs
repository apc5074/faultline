import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildPhase6InspectorSnapshot } from "../dist/index.js";

const context = {
  challenge: {
    slug: "tiny-api", version: 1, title: "Tiny API", prompt: "Design", developmentOnly: true,
    workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 100,
    allowedComponentTypes: ["service"],
  },
  architecture: {
    version: 1,
    components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
    connections: [],
  },
  simulation: { available: true, components: {} },
};

const snapshot = await buildPhase6InspectorSnapshot({
  registry: createDefaultCapabilityRegistry(),
  getContext: () => context,
  development: true,
});

assert.equal(snapshot.browserSupported, false);
assert.ok(snapshot.entries.some((entry) => entry.name === "get_coaching_policy"));
assert.ok(snapshot.entries.some((entry) => entry.name === "focus_component"));
assert.ok(snapshot.entries.some((entry) => entry.name === "run_load_test" && entry.mode === "experiment"));
assert.ok(snapshot.entries.some((entry) => entry.name === "flush_cache" && entry.registrationState === "skipped"));
assert.ok(snapshot.entries.every((entry) => entry.inputSchema.type === "object"));

console.log("verify-phase6-inspector: ok");
