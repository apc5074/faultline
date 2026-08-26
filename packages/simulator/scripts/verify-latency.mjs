import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { evaluatePathLatency, latencyForUtilization } from "../dist/index.js";

const samples = [0.5, 0.75, 0.9, 0.95, 1, 1.2];
const base = 20;
const latencies = samples.map((utilization) => latencyForUtilization({ baseLatencyMs: base, utilization }));

assert.deepEqual(
  latencies,
  samples.map((utilization) => latencyForUtilization({ baseLatencyMs: base, utilization })),
);
for (let index = 1; index < latencies.length; index += 1) {
  assert.ok(latencies[index] > latencies[index - 1], `latency should rise from ${samples[index - 1]} to ${samples[index]}`);
}

const healthyDelta = latencyForUtilization({ baseLatencyMs: base, utilization: 0.7 }) - latencyForUtilization({ baseLatencyMs: base, utilization: 0 });
const criticalDelta = latencyForUtilization({ baseLatencyMs: base, utilization: 1 }) - latencyForUtilization({ baseLatencyMs: base, utilization: 0.9 });
assert.ok(criticalDelta > healthyDelta, "90–100% should rise faster than the healthy range");

assert.equal(latencyForUtilization({ baseLatencyMs: 20, utilization: 0 }), 20);
assert.equal(latencyForUtilization({ baseLatencyMs: 30, utilization: 0 }), 30);
assert.ok(latencyForUtilization({ baseLatencyMs: 20, utilization: 1.2 }) > latencyForUtilization({ baseLatencyMs: 20, utilization: 1 }));

const architectureFor = (instances, tier) => ({
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
});

const evaluate = (instances, tier) =>
  evaluatePathLatency({ architecture: architectureFor(instances, tier), challenge: tinyApiChallenge, registry: componentRegistry });

const valid = evaluate(4, "medium");
assert.equal(valid.valid, true);
if (!valid.valid) throw new Error("Expected valid architecture.");
assert.equal(valid.paths.length, 1);
assert.equal(
  valid.p95LatencyMs,
  valid.components["service-01"].p95LatencyMs + valid.components["postgres-01"].p95LatencyMs,
);
assert.ok(valid.p95LatencyMs < 200, `valid Tiny API config should satisfy p95 < 200, got ${valid.p95LatencyMs}`);
assert.equal(valid.components["service-01"].baseLatencyMs, 20);
assert.equal(valid.components["postgres-01"].baseLatencyMs, 30);

const stressed = evaluate(2, "small");
assert.equal(stressed.valid, true);
if (!stressed.valid) throw new Error("Expected valid architecture.");
assert.ok(stressed.p95LatencyMs >= 200, `stressed Tiny API config should fail p95 < 200, got ${stressed.p95LatencyMs}`);
assert.ok(stressed.components["service-01"].p95LatencyMs > valid.components["service-01"].p95LatencyMs);
assert.ok(stressed.components["postgres-01"].p95LatencyMs > valid.components["postgres-01"].p95LatencyMs);

console.log("latency model verified");
