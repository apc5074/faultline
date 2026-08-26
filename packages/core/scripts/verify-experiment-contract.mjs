import assert from "node:assert/strict";
import {
  definitionToOverlay,
  isEmptyOverlay,
  validateExperimentDefinition,
} from "../dist/index.js";

const roundTrip = JSON.parse(
  JSON.stringify({
    type: "traffic_multiplier",
    parameters: { multiplier: 2 },
  }),
);
assert.deepEqual(roundTrip, { type: "traffic_multiplier", parameters: { multiplier: 2 } });
assert.equal(validateExperimentDefinition(roundTrip).success, true);

const overlay = definitionToOverlay({ type: "cache_flush", parameters: { componentId: "redis-01" } });
assert.deepEqual(overlay, { coldCacheComponentIds: ["redis-01"] });
assert.equal(isEmptyOverlay({}), true);
assert.equal(isEmptyOverlay(overlay), false);

assert.equal(validateExperimentDefinition(null).success, false);
assert.equal(validateExperimentDefinition({ type: "unknown", parameters: {} }).success, false);

const invalidMultiplier = validateExperimentDefinition({
  type: "traffic_multiplier",
  parameters: { multiplier: 1 },
});
assert.equal(invalidMultiplier.success, false);
if (invalidMultiplier.success) throw new Error("Expected invalid multiplier.");
assert.equal(invalidMultiplier.errors[0]?.code, "INVALID_INPUT");

const validTypes = [
  { type: "traffic_multiplier", parameters: { multiplier: 5 } },
  { type: "hot_key", parameters: { hotKeyReadFraction: 0.5 } },
  { type: "cache_flush", parameters: { componentId: "cdn-01" } },
  { type: "component_failure", parameters: { componentId: "service-01" } },
  { type: "region_failure", parameters: { regionId: "us-east-1" } },
];
for (const definition of validTypes) {
  const result = validateExperimentDefinition(definition);
  assert.equal(result.success, true, definition.type);
}

const invalidHotKey = validateExperimentDefinition({
  type: "hot_key",
  parameters: { hotKeyReadFraction: 1.5 },
});
assert.equal(invalidHotKey.success, false);

console.log("experiment contract verified");
