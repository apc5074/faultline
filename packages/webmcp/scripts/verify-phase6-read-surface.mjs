import assert from "node:assert/strict";

import {
  createAgentCapabilityRegistry,
  createDefaultCapabilityRegistry,
  getChallengeCapability,
  noInputSchema,
} from "@faultline/agent-capabilities";
import {
  buildPhase6ReadSurface,
  PHASE_6_READ_CAPABILITY_NAMES,
  Phase6SurfaceConfigurationError,
} from "../dist/phase6-read-surface.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service"],
};

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const context = {
  challenge,
  architecture,
  cost: { monthlyTotal: 24_000, lineItems: [{ componentId: "service-1", amount: 24_000 }] },
};

const getContext = () => context;
const registry = createDefaultCapabilityRegistry();

const surface = await buildPhase6ReadSurface({ registry, getContext, development: true });

assert.equal(surface.tools.length, PHASE_6_READ_CAPABILITY_NAMES.length);
assert.deepEqual(
  surface.tools.map((tool) => tool.name).sort(),
  [...PHASE_6_READ_CAPABILITY_NAMES].sort(),
);
assert.equal(surface.skipped.length, 0);
assert.equal(surface.tools.some((tool) => tool.name === "get_faultline_status"), false);

for (const tool of surface.tools) {
  assert.equal(tool.annotations?.readOnlyHint, true);
  assert.equal(tool.annotations?.idempotentHint, true);
  assert.equal(tool.annotations?.destructiveHint, undefined);
}

const experimentRegistry = createAgentCapabilityRegistry(
  registry.list().map((capability) =>
    capability.name === "get_challenge" ? { ...getChallengeCapability, mode: "experiment" } : capability,
  ),
);

await assert.rejects(
  () => buildPhase6ReadSurface({ registry: experimentRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /ineligible_mode/.test(error.message),
);

const missingRegistry = createAgentCapabilityRegistry(
  registry.list().filter((capability) => capability.name !== "get_metrics"),
);

await assert.rejects(
  () => buildPhase6ReadSurface({ registry: missingRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /missing allowlisted capability "get_metrics"/.test(error.message),
);

const unsafeAnnotationsRegistry = createAgentCapabilityRegistry(
  registry.list().map((capability) =>
    capability.name === "get_challenge"
      ? {
          name: "get_challenge",
          description: "Unsafe fixture.",
          inputSchema: noInputSchema,
          mode: "read",
          availableWhen: () => true,
          execute: () => ({ ok: true, data: {} }),
        }
      : capability,
  ),
);

await assert.rejects(
  () => buildPhase6ReadSurface({ registry: unsafeAnnotationsRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /ineligible_annotations/.test(error.message),
);

const unavailableRegistry = createAgentCapabilityRegistry(
  registry.list().map((capability) =>
    capability.name === "get_metrics" ? { ...capability, availableWhen: () => false } : capability,
  ),
);

await assert.rejects(
  () => buildPhase6ReadSurface({ registry: unavailableRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /get_metrics.*unavailable/.test(error.message),
);

const productionMissing = await buildPhase6ReadSurface({
  registry: missingRegistry,
  getContext,
  development: false,
});
assert.equal(productionMissing.tools.length, PHASE_6_READ_CAPABILITY_NAMES.length - 1);
assert.deepEqual(productionMissing.skipped, [{ name: "get_metrics", reason: "missing" }]);

console.log("verify-phase6-read-surface: ok");
