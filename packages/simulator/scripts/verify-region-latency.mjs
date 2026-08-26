import assert from "node:assert/strict";
import { regionIds, UnknownRegionError } from "@faultline/core";
import {
  getRegionLatencyMatrix,
  getRegionLatencyMs,
  SAME_REGION_LATENCY_MS,
} from "../dist/index.js";

assert.equal(SAME_REGION_LATENCY_MS, 10);

const matrix = getRegionLatencyMatrix();
assert.deepEqual(Object.keys(matrix).sort(), [...regionIds].sort());

for (const source of regionIds) {
  for (const target of regionIds) {
    const latencyMs = getRegionLatencyMs(source, target);
    assert.equal(typeof latencyMs, "number");
    assert.ok(Number.isFinite(latencyMs));
    assert.ok(latencyMs > 0, `${source} → ${target} must be nonzero`);
    assert.equal(latencyMs, matrix[source][target]);
    assert.equal(getRegionLatencyMs(target, source), latencyMs, `${source}↔${target} must be symmetric`);
  }
  assert.equal(getRegionLatencyMs(source, source), SAME_REGION_LATENCY_MS);
}

assert.equal(getRegionLatencyMs("us-east", "europe"), 80);
assert.equal(getRegionLatencyMs("us-east", "singapore"), 220);
assert.equal(getRegionLatencyMs("us-east", "us-east"), 10);

assert.throws(() => getRegionLatencyMs("atlantis", "us-east"), (error) => error instanceof UnknownRegionError);
assert.throws(() => getRegionLatencyMs("us-east", "atlantis"), (error) => error instanceof UnknownRegionError);

const first = getRegionLatencyMs("tokyo", "india");
const second = getRegionLatencyMs("tokyo", "india");
assert.equal(first, second);

console.log("region latency matrix verified");
