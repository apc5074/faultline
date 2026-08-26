import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { evaluateServiceCapacity } from "../dist/index.js";

const architectureForInstances = (instances) => ({
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
});

const evaluate = (instances) => evaluateServiceCapacity({ architecture: architectureForInstances(instances), challenge: tinyApiChallenge, registry: componentRegistry });

const underprovisioned = evaluate(2);
assert.equal(underprovisioned.valid, true);
if (!underprovisioned.valid) throw new Error("Expected valid architecture.");
assert.deepEqual(underprovisioned.services["service-01"], { incomingRps: 6000, capacityRps: 4000, handledRps: 4000, unmetRps: 2000, utilization: 1.5, headroom: -0.5, state: "saturated" });
assert.equal(underprovisioned.events.some((event) => event.type === "component_saturated"), true);

const borderline = evaluate(3);
assert.equal(borderline.valid, true);
if (!borderline.valid) throw new Error("Expected valid architecture.");
assert.equal(borderline.services["service-01"].utilization, 1);
assert.equal(borderline.services["service-01"].headroom, 0);
assert.equal(borderline.services["service-01"].state, "critical");

const healthy = evaluate(4);
assert.equal(healthy.valid, true);
if (!healthy.valid) throw new Error("Expected valid architecture.");
assert.deepEqual(healthy.services["service-01"], { incomingRps: 6000, capacityRps: 8000, handledRps: 6000, unmetRps: 0, utilization: 0.75, headroom: 0.25, state: "warning" });
assert.equal(healthy.events.some((event) => event.type === "component_warning"), true);

const largeSize = evaluateServiceCapacity({
  architecture: {
    ...architectureForInstances(2),
    components: architectureForInstances(2).components.map((component) =>
      component.id === "service-01" ? { ...component, config: { size: "large", instances: 2 } } : component,
    ),
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(largeSize.valid, true);
if (!largeSize.valid) throw new Error("Expected valid architecture.");
assert.equal(largeSize.services["service-01"].capacityRps, 8_000);
assert.equal(largeSize.services["service-01"].utilization, 0.75);

console.log("service capacity verified");
