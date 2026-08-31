import assert from "node:assert/strict";

import {
  architectureAvailabilityFingerprint,
  BASELINE_READ_CAPABILITY_NAMES,
  createDefaultCapabilityRegistry,
  resolveCapabilities,
} from "@faultline/agent-capabilities";
import { buildAgentReadSurface, registerAgentWebMcpSurface, toWebMcpTool } from "../dist/index.js";

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
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const withRedisArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    { id: "redis-1", type: "redis", config: { mode: "standalone" }, deployments: [], ui: { x: 1, y: 0 } },
  ],
};

const withReplicaArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [],
      ui: { x: 2, y: 0 },
    },
  ],
};

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

const movedUiArchitecture = structuredClone(multiRegionArchitecture);
movedUiArchitecture.components[0].ui = { x: 999, y: 999 };

const registry = createDefaultCapabilityRegistry();

async function surfaceNames(architecture) {
  const surface = await buildAgentReadSurface({
    registry,
    getContext: () => ({ challenge, architecture }),
    development: true,
  });
  return surface.resolvedNames;
}

const baselineNames = await surfaceNames(baselineArchitecture);
assert.deepEqual(baselineNames, [...BASELINE_READ_CAPABILITY_NAMES]);

const redisNames = await surfaceNames(withRedisArchitecture);
assert.deepEqual(redisNames, [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache"]);

const replicaNames = await surfaceNames(withReplicaArchitecture);
assert.deepEqual(replicaNames, [...BASELINE_READ_CAPABILITY_NAMES, "inspect_replication"]);

const regionNames = await surfaceNames(multiRegionArchitecture);
assert.deepEqual(regionNames, [...BASELINE_READ_CAPABILITY_NAMES, "inspect_regional_traffic"]);

assert.equal(
  architectureAvailabilityFingerprint(multiRegionArchitecture),
  architectureAvailabilityFingerprint(movedUiArchitecture),
);

const redisRemovedArchitecture = structuredClone(baselineArchitecture);
const afterRedisRemoval = await surfaceNames(redisRemovedArchitecture);
assert.deepEqual(afterRedisRemoval, baselineNames);

assert.notEqual(
  architectureAvailabilityFingerprint(withRedisArchitecture),
  architectureAvailabilityFingerprint(baselineArchitecture),
);

const staleTool = toWebMcpTool(registry.get("inspect_cache"), {
  registry,
  getContext: () => ({ challenge, architecture: baselineArchitecture }),
});
const staleResult = await staleTool.execute({}, {});
assert.equal(staleResult.ok, false);
if (!staleResult.ok) {
  assert.equal(staleResult.code, "NOT_FOUND");
}

const resolved = resolveCapabilities(registry, { challenge, architecture: withRedisArchitecture }, { development: true });
const webSurface = await buildAgentReadSurface({
  registry,
  getContext: () => ({ challenge, architecture: withRedisArchitecture }),
  development: true,
});
assert.deepEqual(webSurface.resolvedNames, resolved.names);

// Group ownership keeps stable registrations out of specialist churn.
const registrations = [];
const modelContext = {
  registerTool: async (tool) => registrations.push(tool.name),
};
async function registerGroup(group, architecture) {
  const controller = new AbortController();
  return registerAgentWebMcpSurface({
    group,
    modelContext,
    registry,
    getContext: () => ({ challenge, architecture }),
    signal: controller.signal,
    development: true,
  });
}
const stableBefore = await registerGroup("stable-review", baselineArchitecture);
const stableAfterRedis = await registerGroup("stable-review", withRedisArchitecture);
assert.deepEqual(stableAfterRedis.registeredToolNames, stableBefore.registeredToolNames);
const specialistsBefore = await registerGroup("specialists", baselineArchitecture);
const specialistsAfterRedis = await registerGroup("specialists", withRedisArchitecture);
assert.deepEqual(specialistsBefore.registeredToolNames, []);
assert.deepEqual(specialistsAfterRedis.registeredToolNames, ["inspect_cache"]);
assert.equal(registrations.includes("review_current_design"), true);

console.log("verify-dynamic-surface-reconciliation: ok");
