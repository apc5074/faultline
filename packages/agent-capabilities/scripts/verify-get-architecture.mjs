import assert from "node:assert/strict";

import {
  buildGetArchitectureOutput,
  createDefaultCapabilityRegistry,
  getArchitectureCapability,
} from "../dist/index.js";

const challenge = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API.",
  developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["service", "postgres"],
};

const architecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 8 },
      deployments: [
        { id: "svc-us-east", regionId: "us-east", config: { instances: 4 } },
        { id: "svc-europe", regionId: "europe", config: { instances: 4 } },
      ],
      ui: { x: 120, y: 40 },
    },
    {
      id: "cdn-1",
      type: "cdn",
      config: { ttl: 300 },
      deployments: [],
      ui: { x: 10, y: 10 },
    },
    {
      id: "redis-1",
      type: "redis",
      config: { mode: "replicated" },
      deployments: [{ id: "redis-us-east", regionId: "us-east", config: {} }],
      ui: { x: 200, y: 80 },
    },
  ],
  connections: [
    {
      id: "conn-2",
      sourceComponentId: "service-1",
      sourcePortId: "out",
      targetComponentId: "redis-1",
      targetPortId: "in",
      type: "request",
    },
    {
      id: "conn-1",
      sourceComponentId: "cdn-1",
      sourcePortId: "out",
      targetComponentId: "service-1",
      targetPortId: "in",
      type: "request",
    },
  ],
};

assert.equal(getArchitectureCapability.name, "get_architecture");
assert.equal(getArchitectureCapability.mode, "read");
assert.equal(getArchitectureCapability.annotations?.readOnlyHint, true);

const output = buildGetArchitectureOutput(architecture);

assert.deepEqual(output.inventory, {
  totalComponents: 3,
  totalConnections: 2,
  componentsByType: [
    { type: "cdn", count: 1, componentIds: ["cdn-1"] },
    { type: "redis", count: 1, componentIds: ["redis-1"] },
    { type: "service", count: 1, componentIds: ["service-1"] },
  ],
});

assert.deepEqual(output.components.map((component) => component.id), ["cdn-1", "redis-1", "service-1"]);
assert.deepEqual(output.components[0], {
  id: "cdn-1",
  type: "cdn",
  config: { ttl: 300 },
});
assert.equal("deployments" in output.components[0], false);
assert.deepEqual(output.components[1], {
  id: "redis-1",
  type: "redis",
  config: { mode: "replicated" },
  deployments: [{ id: "redis-us-east", regionId: "us-east", config: {} }],
});
assert.deepEqual(output.components[2], {
  id: "service-1",
  type: "service",
  config: { instances: 8 },
  deployments: [
    { id: "svc-europe", regionId: "europe", config: { instances: 4 } },
    { id: "svc-us-east", regionId: "us-east", config: { instances: 4 } },
  ],
});

assert.deepEqual(output.connections, [
  { source: "cdn-1", target: "service-1", type: "request" },
  { source: "service-1", target: "redis-1", type: "request" },
]);

const serialized = JSON.stringify(output);
assert.ok(!serialized.includes('"ui"'));
assert.ok(!serialized.includes('"x"'));
assert.ok(!serialized.includes("sourcePortId"));
assert.ok(!serialized.includes("React"));

const logicalCapacityArchitecture = {
  ...architecture,
  components: [
    { ...architecture.components[0], id: "service-5", config: { instances: 5 } },
    { ...architecture.components[2], id: "postgres-1", type: "postgres", deployments: [{ id: "pg-replica", regionId: "us-east", config: { role: "replica" } }] },
  ],
  connections: [],
};
const logicalCapacity = buildGetArchitectureOutput(logicalCapacityArchitecture);
assert.equal(logicalCapacity.inventory.totalComponents, 2);
assert.deepEqual(logicalCapacity.inventory.componentsByType, [
  { type: "postgres", count: 1, componentIds: ["postgres-1"] },
  { type: "service", count: 1, componentIds: ["service-5"] },
]);
assert.equal(logicalCapacity.inventory.totalConnections, 0);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_architecture"));
assert.ok(registry.list().length >= 3);
assert.ok(registry.has("get_architecture"));

const context = { challenge, architecture };
const invoked = await registry.invoke("get_architecture", context, undefined);
assert.equal(invoked.ok, true);
if (invoked.ok) {
  assert.deepEqual(invoked.data, output);
}

console.log("verify-get-architecture: ok");
