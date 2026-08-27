import assert from "node:assert/strict";

import {
  BASELINE_VISUAL_CAPABILITY_NAMES,
  BaselineCapabilityConfigurationError,
  createAgentCapabilityRegistry,
  createDefaultCapabilityRegistry,
  resolveVisualCapabilities,
  RESOLVED_VISUAL_CAPABILITY_NAME_ORDER,
} from "../dist/index.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service", "redis", "postgres"],
};

const baselineArchitecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 0, y: 0 } },
  ],
  connections: [],
};

const context = { challenge, architecture: baselineArchitecture };
const registry = createDefaultCapabilityRegistry();

const first = resolveVisualCapabilities(registry, context, { development: true });
const second = resolveVisualCapabilities(registry, context, { development: true });

assert.deepEqual(first.names, second.names);
assert.deepEqual(first.names, [...BASELINE_VISUAL_CAPABILITY_NAMES]);
assert.deepEqual(first.names, [...RESOLVED_VISUAL_CAPABILITY_NAME_ORDER]);
assert.deepEqual(first.skipped, []);
assert.equal(first.capabilities.length, 4);

for (const capability of first.capabilities) {
  assert.equal(capability.mode, "visual");
  assert.equal(capability.annotations?.readOnlyHint, false);
  assert.equal(capability.annotations?.destructiveHint, false);
}

const emptyArchitectureContext = {
  challenge,
  architecture: { version: 1, components: [], connections: [] },
};
const emptyResolved = resolveVisualCapabilities(registry, emptyArchitectureContext, { development: true });
assert.deepEqual(emptyResolved.names, [...BASELINE_VISUAL_CAPABILITY_NAMES]);

const missingRegistry = createAgentCapabilityRegistry(
  registry.list().filter((capability) => capability.name !== "focus_component"),
);
assert.throws(
  () => resolveVisualCapabilities(missingRegistry, context, { development: true }),
  (error) => error instanceof BaselineCapabilityConfigurationError && /focus_component/.test(error.message),
);

const productionMissing = resolveVisualCapabilities(missingRegistry, context, { development: false });
assert.deepEqual(productionMissing.skipped, [{ name: "focus_component", reason: "missing" }]);
assert.equal(productionMissing.names.length, BASELINE_VISUAL_CAPABILITY_NAMES.length - 1);

const wrongModeRegistry = createAgentCapabilityRegistry(
  registry.list().map((capability) =>
    capability.name === "annotate_component" ? { ...capability, mode: "read" } : capability,
  ),
);
assert.throws(
  () => resolveVisualCapabilities(wrongModeRegistry, context, { development: true }),
  (error) => error instanceof BaselineCapabilityConfigurationError && /annotate_component.*ineligible_mode/.test(error.message),
);

const unavailableRegistry = createAgentCapabilityRegistry(
  registry.list().map((capability) =>
    capability.name === "highlight_connection" ? { ...capability, availableWhen: () => false } : capability,
  ),
);
const unavailable = resolveVisualCapabilities(unavailableRegistry, context, { development: true });
assert.deepEqual(unavailable.skipped, [{ name: "highlight_connection", reason: "unavailable" }]);
assert.equal(unavailable.names.includes("highlight_connection"), false);

console.log("verify-resolve-visual-capabilities: ok");
