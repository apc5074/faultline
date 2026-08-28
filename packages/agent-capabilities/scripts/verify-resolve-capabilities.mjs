import assert from "node:assert/strict";

import {
  architectureAvailabilityFingerprint,
  architectureHasMultiRegionDeployments,
  architectureHasPostgresReplica,
  architectureHasRedis,
  BaselineCapabilityConfigurationError,
  BASELINE_READ_CAPABILITY_NAMES,
  createAgentCapabilityRegistry,
  createDefaultCapabilityRegistry,
  phase7DynamicCapabilityPredicate,
  resolveCapabilities,
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

const defaultRegistry = createDefaultCapabilityRegistry();

const registry = defaultRegistry;
const first = resolveCapabilities(registry, context, { development: true });
const second = resolveCapabilities(registry, context, { development: true });
assert.deepEqual(first.names, second.names);
assert.deepEqual(first.names, [...BASELINE_READ_CAPABILITY_NAMES]);
assert.deepEqual(first.skipped, [
  { name: "inspect_cache", reason: "unavailable" },
  { name: "inspect_replication", reason: "unavailable" },
  { name: "inspect_regional_traffic", reason: "unavailable" },
  { name: "inspect_queue", reason: "unavailable" },
  { name: "inspect_processing", reason: "unavailable" },
  { name: "inspect_object_storage", reason: "unavailable" },
  { name: "inspect_playback_origin", reason: "unavailable" },
]);

const missingBaselineRegistry = createAgentCapabilityRegistry(
  registry.list().filter((capability) => capability.name !== "get_metrics"),
);
assert.throws(
  () => resolveCapabilities(missingBaselineRegistry, context, { development: true }),
  (error) => error instanceof BaselineCapabilityConfigurationError && /get_metrics/.test(error.message),
);
const productionMissing = resolveCapabilities(missingBaselineRegistry, context, { development: false });
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
assert.equal(productionMissing.names.includes("get_metrics"), false);

const redisArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    { id: "redis-1", type: "redis", config: { mode: "standalone" }, deployments: [], ui: { x: 10, y: 10 } },
    { id: "redis-2", type: "redis", config: { mode: "standalone" }, deployments: [], ui: { x: 20, y: 20 } },
  ],
};
assert.equal(architectureHasRedis(redisArchitecture), true);
assert.equal(phase7DynamicCapabilityPredicate("inspect_cache", redisArchitecture), true);

const withRedis = resolveCapabilities(defaultRegistry, { challenge, architecture: redisArchitecture });
assert.deepEqual(withRedis.names, [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache"]);
assert.equal(withRedis.names.filter((name) => name === "inspect_cache").length, 1);

const replicaArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [],
      ui: { x: 5, y: 5 },
    },
  ],
};
assert.equal(architectureHasPostgresReplica(replicaArchitecture), true);
const withReplica = resolveCapabilities(defaultRegistry, { challenge, architecture: replicaArchitecture });
assert.deepEqual(withReplica.names.at(-1), "inspect_replication");

const multiRegionArchitecture = {
  ...baselineArchitecture,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 4 },
      deployments: [
        { id: "svc-east", regionId: "us-east", config: { instances: 2 } },
        { id: "svc-eu", regionId: "europe", config: { instances: 2 } },
      ],
      ui: { x: 0, y: 0 },
    },
  ],
  connections: [],
};
assert.equal(architectureHasMultiRegionDeployments(multiRegionArchitecture), true);
const withRegions = resolveCapabilities(defaultRegistry, { challenge, architecture: multiRegionArchitecture });
assert.ok(withRegions.names.includes("inspect_regional_traffic"));

const movedUiArchitecture = structuredClone(multiRegionArchitecture);
movedUiArchitecture.components[0].ui = { x: 999, y: 999 };
assert.equal(
  architectureAvailabilityFingerprint(multiRegionArchitecture),
  architectureAvailabilityFingerprint(movedUiArchitecture),
);
const movedUiSurface = resolveCapabilities(defaultRegistry, {
  challenge,
  architecture: movedUiArchitecture,
});
assert.deepEqual(movedUiSurface.names, withRegions.names);

const beforeJson = JSON.stringify(baselineArchitecture);
resolveCapabilities(registry, context);
resolveCapabilities(defaultRegistry, { challenge, architecture: redisArchitecture });
assert.equal(JSON.stringify(baselineArchitecture), beforeJson);

const unavailableRegistry = createAgentCapabilityRegistry([
  ...registry.list().map((capability) =>
    capability.name === "get_metrics" ? { ...capability, availableWhen: () => false } : capability,
  ),
]);
const unavailable = resolveCapabilities(unavailableRegistry, context, { development: true });
assert.deepEqual(unavailable.skipped, [
  { name: "get_metrics", reason: "unavailable" },
  { name: "inspect_cache", reason: "unavailable" },
  { name: "inspect_replication", reason: "unavailable" },
  { name: "inspect_regional_traffic", reason: "unavailable" },
  { name: "inspect_queue", reason: "unavailable" },
  { name: "inspect_processing", reason: "unavailable" },
  { name: "inspect_object_storage", reason: "unavailable" },
  { name: "inspect_playback_origin", reason: "unavailable" },
]);
assert.equal(unavailable.names.includes("get_metrics"), false);

console.log("verify-resolve-capabilities: ok");
