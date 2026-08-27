import assert from "node:assert/strict";
import { compareGeographicRoutes } from "../features/world-map/route-comparison.ts";

const baseline = [{ type: "traffic_routed", componentId: "svc", data: { originRegion: "us-east", destinationRegion: "us-east", deploymentId: "svc-us", kind: "request", requestsPerSecond: 100, networkLatencyMs: 10 } }];
const outcome = [{ type: "traffic_routed", componentId: "svc", data: { originRegion: "us-east", destinationRegion: "europe", deploymentId: "svc-eu", kind: "request", requestsPerSecond: 100, networkLatencyMs: 90 } }];
const changes = compareGeographicRoutes(baseline, outcome);
assert.equal(changes.length, 2);
assert.deepEqual(changes.map((change) => change.rpsDelta).sort((left, right) => left - right), [-100, 100]);
console.log("route comparison verified");
