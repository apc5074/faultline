import assert from "node:assert/strict";
import {
  ComponentDefinitionError,
  DuplicateComponentTypeError,
  UnknownComponentTypeError,
  componentRegistry,
  createComponentRegistry,
  postgresDefinition,
  postgresTierModels,
  serviceCapacityPerInstance,
  serviceDefinition,
  serviceMonthlyCostPerInstance,
  trafficSourceDefinition,
} from "../dist/index.js";

const schema = {
  safeParse(input) {
    return input && typeof input === "object" && !Array.isArray(input)
      ? { success: true, data: input }
      : { success: false, errors: ["Expected an object."] };
  },
};

function definition(type, ports) {
  return {
    type,
    label: type,
    category: "infrastructure",
    defaultConfig: {},
    configSchema: schema,
    ports,
    metrics: [{ id: "load", label: "Load", unit: "rps" }],
    simulation: {},
    cost: {},
    regionSupport: false,
    replicationSupport: false,
    clusteringSupport: false,
    agentCapabilities: [],
    schemaVersion: 1,
  };
}

const registry = createComponentRegistry([
  definition("traffic-source", [{ id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] }]),
  definition("service", [
    { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
    { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] },
  ]),
  definition("postgres", [{ id: "database_in", label: "Database", direction: "input", connectionTypes: ["read_write"] }]),
]);

assert.equal(registry.get("service").type, "service");
assert.equal(registry.has("postgres"), true);
assert.equal(registry.list().length, 3);
assert.throws(() => registry.register(definition("service", [])), DuplicateComponentTypeError);
assert.throws(() => registry.get("missing"), UnknownComponentTypeError);
assert.throws(() => registry.register({ ...definition("broken", []), defaultConfig: [] }), ComponentDefinitionError);

assert.equal(componentRegistry.get("traffic-source"), trafficSourceDefinition);
assert.deepEqual(trafficSourceDefinition.defaultConfig, { label: "Incoming traffic" });
assert.deepEqual(trafficSourceDefinition.ports, [
  { id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] },
]);
assert.deepEqual(trafficSourceDefinition.metrics, [
  { id: "outgoing_requests_per_second", label: "Outgoing requests/sec", unit: "requests/sec" },
]);
assert.deepEqual(trafficSourceDefinition.simulation, { injectsChallengeWorkload: true });
assert.deepEqual(trafficSourceDefinition.cost, { fixedMonthlyCost: 0 });

assert.equal(componentRegistry.get("service"), serviceDefinition);
assert.deepEqual(serviceDefinition.defaultConfig, { instances: 1 });
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 1 }).success, true);
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 0 }).success, false);
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 11 }).success, false);
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 1.5 }).success, false);
assert.deepEqual(serviceDefinition.ports, [
  { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
  { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] },
]);
assert.equal(serviceDefinition.simulation.capacityPerInstance, serviceCapacityPerInstance);
assert.equal(serviceDefinition.cost.monthlyCostPerInstance, serviceMonthlyCostPerInstance);

assert.equal(componentRegistry.get("postgres"), postgresDefinition);
assert.deepEqual(postgresDefinition.defaultConfig, { tier: "small" });
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "small" }).success, true);
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "medium" }).success, true);
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "large" }).success, true);
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "extra-large" }).success, false);
assert.equal(postgresTierModels.small.readCapacityRps, 5_000);
assert.equal(postgresTierModels.small.writeCapacityRps, 800);
assert.equal(postgresTierModels.medium.readCapacityRps, 10_000);
assert.equal(postgresTierModels.medium.writeCapacityRps, 2_000);
assert.equal(postgresTierModels.large.monthlyCost, 7_000);
assert.notEqual(postgresTierModels.small.monthlyCost, postgresTierModels.medium.monthlyCost);
assert.deepEqual(postgresDefinition.ports, [
  { id: "database_in", label: "Database operations", direction: "input", connectionTypes: ["read_write"] },
]);
console.log("component registry verified");
