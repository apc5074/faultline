import assert from "node:assert/strict";
import {
  checkConnectionCompatibility,
  definitionToOverlay,
  getRegion,
  getRegions,
  isEmptyOverlay,
  isValidRegion,
  regionIds,
  UnknownRegionError,
  validateArchitecture,
  validateExperimentDefinition,
} from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 240, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 480, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};
assert.deepEqual(JSON.parse(JSON.stringify(architecture)), architecture);
assert.equal(validateArchitecture(architecture).success, true);
const beforeMove = JSON.stringify({ components: architecture.components.map(({ id, type, config, deployments }) => ({ id, type, config, deployments })), connections: architecture.connections });
architecture.components[1].ui = { x: 900, y: 700 };
const afterMove = JSON.stringify({ components: architecture.components.map(({ id, type, config, deployments }) => ({ id, type, config, deployments })), connections: architecture.connections });
assert.equal(afterMove, beforeMove);
assert.equal(validateArchitecture({ ...architecture, components: [...architecture.components, architecture.components[0]] }).success, false);
const trafficRequestOut = { id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] };
const serviceRequestIn = { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] };
const serviceDatabaseOut = { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] };
const postgresDatabaseIn = { id: "database_in", label: "Database", direction: "input", connectionTypes: ["read_write"] };
assert.equal(checkConnectionCompatibility(trafficRequestOut, serviceRequestIn, "request").valid, true);
assert.equal(checkConnectionCompatibility(serviceDatabaseOut, postgresDatabaseIn, "read_write").valid, true);
assert.equal(checkConnectionCompatibility(postgresDatabaseIn, trafficRequestOut, "request").valid, false);
assert.equal(checkConnectionCompatibility(trafficRequestOut, postgresDatabaseIn, "request").valid, false);

const expectedRegions = [
  { id: "us-east", label: "US East" }, { id: "us-west", label: "US West" }, { id: "europe", label: "Europe" },
  { id: "india", label: "India" }, { id: "singapore", label: "Singapore" }, { id: "tokyo", label: "Tokyo" },
];
assert.deepEqual([...regionIds], expectedRegions.map((region) => region.id));
const regions = getRegions();
assert.equal(regions.length, 6);
assert.deepEqual(regions.map(({ id, label }) => ({ id, label })), expectedRegions);
for (const region of regions) {
  assert.equal(region.health, "healthy");
  assert.equal(typeof region.coordinates.x, "number");
  assert.equal(typeof region.coordinates.y, "number");
  assert.ok(Number.isFinite(region.coordinates.x) && Number.isFinite(region.coordinates.y));
  assert.ok(region.coordinates.x >= 0 && region.coordinates.x <= 1);
  assert.ok(region.coordinates.y >= 0 && region.coordinates.y <= 1);
  assert.equal(isValidRegion(region.id), true);
  assert.equal(getRegion(region.id), region);
}
assert.equal(isValidRegion("us-central"), false);
assert.equal(isValidRegion(""), false);
assert.equal(isValidRegion(null), false);
assert.throws(() => getRegion("atlantis"), (error) => {
  assert.ok(error instanceof UnknownRegionError);
  assert.match(error.message, /Unknown region "atlantis"/);
  assert.match(error.message, /us-east/);
  return true;
});

const roundTrip = JSON.parse(JSON.stringify({ type: "traffic_multiplier", parameters: { multiplier: 2 } }));
assert.deepEqual(roundTrip, { type: "traffic_multiplier", parameters: { multiplier: 2 } });
assert.equal(validateExperimentDefinition(roundTrip).success, true);
for (const multiplier of [1.25, 1.5, 2, 3, 5]) {
  assert.equal(validateExperimentDefinition({ type: "traffic_multiplier", parameters: { multiplier } }).success, true);
}
const overlay = definitionToOverlay({ type: "cache_flush", parameters: { componentId: "redis-01" } });
assert.deepEqual(overlay, { coldCacheComponentIds: ["redis-01"] });
assert.equal(isEmptyOverlay({}), true);
assert.equal(isEmptyOverlay(overlay), false);
assert.equal(validateExperimentDefinition(null).success, false);
assert.equal(validateExperimentDefinition({ type: "unknown", parameters: {} }).success, false);
const invalidMultiplier = validateExperimentDefinition({ type: "traffic_multiplier", parameters: { multiplier: 1 } });
assert.equal(invalidMultiplier.success, false);
if (invalidMultiplier.success) throw new Error("Expected invalid multiplier.");
assert.equal(invalidMultiplier.errors[0]?.code, "INVALID_INPUT");
assert.equal(validateExperimentDefinition({ type: "traffic_multiplier", parameters: { multiplier: 2.5 } }).success, false);
for (const multiplier of [0, -1, 1, 2.25, 10, NaN, Infinity]) {
  assert.equal(validateExperimentDefinition({ type: "traffic_multiplier", parameters: { multiplier } }).success, false);
}
for (const definition of [
  { type: "traffic_multiplier", parameters: { multiplier: 5 } },
  { type: "hot_key", parameters: { hotKeyReadFraction: 0.5 } },
  { type: "cache_flush", parameters: { componentId: "cdn-01" } },
  { type: "component_failure", parameters: { componentId: "service-01" } },
  { type: "region_failure", parameters: { regionId: "us-east-1" } },
]) assert.equal(validateExperimentDefinition(definition).success, true, definition.type);
assert.equal(validateExperimentDefinition({ type: "hot_key", parameters: { hotKeyReadFraction: 1.5 } }).success, false);

console.log("core contracts verified");
