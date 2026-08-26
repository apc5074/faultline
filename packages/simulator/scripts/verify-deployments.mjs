import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { validateArchitecture } from "@faultline/core";
import { validateArchitectureForSimulation } from "../dist/index.js";

assert.equal(componentRegistry.get("service").regionSupport, true);
assert.equal(componentRegistry.get("redis").regionSupport, true);
assert.equal(componentRegistry.get("postgres").regionSupport, true);
assert.equal(componentRegistry.get("global-router").regionSupport, false);
assert.equal(componentRegistry.get("traffic-source").regionSupport, false);

const base = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "service-01",
      type: "service",
      config: { size: "medium", instances: 9 },
      deployments: [
        { id: "dep-us-east", regionId: "us-east", config: { instances: 4 } },
        { id: "dep-europe", regionId: "europe", config: { instances: 3 } },
        { id: "dep-singapore", regionId: "singapore", config: { instances: 2 } },
      ],
      ui: { x: 300, y: 0 },
    },
    {
      id: "redis-01",
      type: "redis",
      config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
      deployments: [
        { id: "dep-redis-us-east", regionId: "us-east", config: {} },
        { id: "dep-redis-europe", regionId: "europe", config: {} },
      ],
      ui: { x: 450, y: 0 },
    },
    {
      id: "postgres-01",
      type: "postgres",
      config: { tier: "medium", readReplicaCount: 2 },
      deployments: [
        { id: "dep-pg-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "dep-pg-eu", regionId: "europe", config: { role: "replica" } },
        { id: "dep-pg-sg", regionId: "singapore", config: { role: "replica" } },
      ],
      ui: { x: 600, y: 0 },
    },
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

assert.equal(validateArchitecture(base).success, true);

const challenge = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "redis"],
};

const valid = validateArchitectureForSimulation({
  architecture: base,
  challenge,
  registry: componentRegistry,
});
assert.equal(valid.valid, true);

const mismatch = structuredClone(base);
mismatch.components[1].config.instances = 8;
const mismatched = validateArchitectureForSimulation({
  architecture: mismatch,
  challenge,
  registry: componentRegistry,
});
assert.equal(mismatched.valid, false);
assert.ok(mismatched.errors?.some((error) => error.code === "DEPLOYMENT_CAPACITY_MISMATCH"));

const unknownRegion = structuredClone(base);
unknownRegion.components[1].deployments[0].regionId = "atlantis";
const unknown = validateArchitectureForSimulation({
  architecture: unknownRegion,
  challenge,
  registry: componentRegistry,
});
assert.equal(unknown.valid, false);
assert.ok(unknown.errors?.some((error) => error.code === "UNKNOWN_REGION"));

const multiPrimary = structuredClone(base);
multiPrimary.components[3].deployments.push({
  id: "dep-pg-primary-2",
  regionId: "tokyo",
  config: { role: "primary" },
});
const multi = validateArchitectureForSimulation({
  architecture: multiPrimary,
  challenge,
  registry: componentRegistry,
});
assert.equal(multi.valid, false);
assert.ok(multi.errors?.some((error) => error.message.includes("multiple primary")));

const routerDeploy = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "router-01",
      type: "global-router",
      config: {},
      deployments: [{ id: "dep-router", regionId: "us-east", config: {} }],
      ui: { x: 150, y: 0 },
    },
    { id: "service-01", type: "service", config: { size: "medium", instances: 1 }, deployments: [], ui: { x: 300, y: 0 } },
  ],
  connections: [
    {
      id: "t-r",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "router-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "r-s",
      sourceComponentId: "router-01",
      sourcePortId: "route_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
  ],
};
const unsupported = validateArchitectureForSimulation({
  architecture: routerDeploy,
  challenge: {
    ...tinyApiChallenge,
    allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "global-router"],
  },
  registry: componentRegistry,
});
assert.equal(unsupported.valid, false);
assert.ok(unsupported.errors?.some((error) => error.code === "UNSUPPORTED_REGIONAL_DEPLOYMENT"));

const moved = structuredClone(base);
moved.components[1].deployments[0].regionId = "us-west";
moved.components[1].deployments[0].id = "dep-us-west";
assert.equal(moved.components[1].id, "service-01");
assert.equal(validateArchitecture(moved).success, true);

console.log("regional deployments verified");
