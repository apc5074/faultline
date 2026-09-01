import assert from "node:assert/strict";

import {
  BASELINE_READ_CAPABILITY_NAMES,
  createAgentCapabilityRegistry,
  createDefaultCapabilityRegistry,
  getChallengeCapability,
  noInputSchema,
  resolveCapabilities,
} from "@faultline/agent-capabilities";
import {
  buildAgentReadSurface,
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

const surface = await buildAgentReadSurface({ registry, getContext, development: true });

assert.equal(surface.tools.length, BASELINE_READ_CAPABILITY_NAMES.length);
assert.deepEqual(surface.resolvedNames, [...BASELINE_READ_CAPABILITY_NAMES]);
assert.deepEqual(
  surface.tools.map((tool) => tool.name),
  [...BASELINE_READ_CAPABILITY_NAMES],
);
assert.deepEqual(surface.skipped, [
  { name: "inspect_cache", reason: "unavailable" },
  { name: "inspect_replication", reason: "unavailable" },
  { name: "inspect_regional_traffic", reason: "unavailable" },
  { name: "inspect_queue", reason: "unavailable" },
  { name: "inspect_processing", reason: "unavailable" },
  { name: "inspect_object_storage", reason: "unavailable" },
  { name: "inspect_playback_origin", reason: "unavailable" },
]);
assert.equal(surface.tools.some((tool) => tool.name === "get_faultline_status"), false);
assert.ok(surface.tools.some((tool) => tool.name === "get_coaching_policy"));
assert.ok(surface.tools.some((tool) => tool.name === "get_session_focus"));

for (const tool of surface.tools) {
  assert.equal(tool.annotations?.readOnlyHint, true);
  assert.equal(tool.annotations?.untrustedContentHint, ["get_session_focus", "review_current_design", "inspect_design_entity", "inspect_component", "get_architecture", "get_cost_breakdown"].includes(tool.name) || undefined);
}

const redisArchitecture = {
  ...architecture,
  components: [
    ...architecture.components,
    { id: "redis-1", type: "redis", config: { mode: "standalone" }, deployments: [], ui: { x: 1, y: 0 } },
  ],
};
const redisContext = { ...context, architecture: redisArchitecture };
const redisSurface = await buildAgentReadSurface({
  registry,
  getContext: () => redisContext,
  development: true,
});
assert.deepEqual(redisSurface.resolvedNames, [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache"]);

const missingRegistry = createAgentCapabilityRegistry(
  registry.list().filter((capability) => capability.name !== "get_metrics"),
);

await assert.rejects(
  () => buildAgentReadSurface({ registry: missingRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /get_metrics/.test(error.message),
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
  () => buildAgentReadSurface({ registry: unsafeAnnotationsRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /ineligible_annotations/.test(error.message),
);

const unavailableRegistry = createAgentCapabilityRegistry(
  registry.list().map((capability) =>
    capability.name === "get_metrics" ? { ...capability, availableWhen: () => false } : capability,
  ),
);

await assert.rejects(
  () => buildAgentReadSurface({ registry: unavailableRegistry, getContext, development: true }),
  (error) => error instanceof Phase6SurfaceConfigurationError && /get_metrics.*unavailable/.test(error.message),
);

const productionMissing = await buildAgentReadSurface({
  registry: missingRegistry,
  getContext,
  development: false,
});
assert.equal(productionMissing.tools.length, BASELINE_READ_CAPABILITY_NAMES.length - 1);
assert.deepEqual(productionMissing.skipped, [
  { name: "get_metrics", reason: "missing" },
  { name: "inspect_cache", reason: "unavailable" },
  { name: "inspect_replication", reason: "unavailable" },
  { name: "inspect_regional_traffic", reason: "unavailable" },
  { name: "inspect_queue", reason: "unavailable" },
  { name: "inspect_processing", reason: "unavailable" },
  { name: "inspect_object_storage", reason: "unavailable" },
  { name: "inspect_playback_origin", reason: "unavailable" },
]);

assert.deepEqual(
  surface.tools.map((tool) => tool.name),
  resolveCapabilities(registry, context, { development: true }).names,
);

console.log("verify-phase6-read-surface: ok");
