import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { checkConnectionCompatibility } from "@faultline/core";
import { estimateMonthlyCost, validateArchitectureForSimulation } from "../dist/index.js";

const redis = componentRegistry.get("redis");
const service = componentRegistry.get("service");
const postgres = componentRegistry.get("postgres");

const serviceOut = service.ports.find((port) => port.id === "database_out");
const redisIn = redis.ports.find((port) => port.id === "cache_in");
const redisOut = redis.ports.find((port) => port.id === "origin_out");
const postgresIn = postgres.ports.find((port) => port.id === "database_in");

assert.ok(serviceOut && redisIn && redisOut && postgresIn);
assert.equal(checkConnectionCompatibility(serviceOut, redisIn, "read_write").valid, true);
assert.equal(checkConnectionCompatibility(redisOut, postgresIn, "read_write").valid, true);
assert.equal(redis.simulation.cacheCapable, true);
assert.equal(redis.simulation.absorbsWrites, false);

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 220, y: 0 } },
    { id: "redis-01", type: "redis", config: { mode: "standalone", tier: "medium", ttlBand: "medium" }, deployments: [], ui: { x: 440, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 660, y: 0 } },
  ],
  connections: [
    {
      id: "traffic-service",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "service-redis",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "redis-01",
      targetPortId: "cache_in",
      type: "read_write",
    },
    {
      id: "redis-postgres",
      sourceComponentId: "redis-01",
      sourcePortId: "origin_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const challengeWithRedis = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "redis"],
};

const validation = validateArchitectureForSimulation({
  architecture,
  challenge: challengeWithRedis,
  registry: componentRegistry,
});
assert.equal(validation.valid, true);

const cost = estimateMonthlyCost({ architecture, registry: componentRegistry });
assert.equal(cost.monthlyTotal, 11_000);
assert.ok(cost.lineItems.some((lineItem) => lineItem.componentId === "redis-01" && lineItem.amount === 3_000));

assert.deepEqual(redis.configSchema.safeParse(architecture.components[2].config).data, {
  mode: "standalone",
  tier: "medium",
  ttlBand: "medium",
});

console.log("redis component verified");
