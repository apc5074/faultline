import assert from "node:assert/strict";
import { getRegion, getRegions, isValidRegion, regionIds, UnknownRegionError } from "../dist/index.js";

const expected = [
  { id: "us-east", label: "US East" },
  { id: "us-west", label: "US West" },
  { id: "europe", label: "Europe" },
  { id: "india", label: "India" },
  { id: "singapore", label: "Singapore" },
  { id: "tokyo", label: "Tokyo" },
];

assert.deepEqual([...regionIds], expected.map((region) => region.id));

const regions = getRegions();
assert.equal(regions.length, 6);
assert.deepEqual(
  regions.map(({ id, label }) => ({ id, label })),
  expected,
);

for (const region of regions) {
  assert.equal(region.health, "healthy");
  assert.equal(typeof region.coordinates.x, "number");
  assert.equal(typeof region.coordinates.y, "number");
  assert.ok(Number.isFinite(region.coordinates.x));
  assert.ok(Number.isFinite(region.coordinates.y));
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

console.log("region registry verified");
