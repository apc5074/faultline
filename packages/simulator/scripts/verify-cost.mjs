import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { CostEstimationError, estimateMonthlyCost } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [],
};

assert.deepEqual(estimateMonthlyCost({ architecture, registry: componentRegistry }), {
  monthlyTotal: 8_000,
  lineItems: [{ componentId: "service-01", amount: 4_000 }, { componentId: "postgres-01", amount: 4_000 }],
});
assert.equal(estimateMonthlyCost({ architecture: { ...architecture, components: architecture.components.map((component) => component.id === "service-01" ? { ...component, config: { instances: 5 } } : component) }, registry: componentRegistry }).monthlyTotal, 9_000);
assert.equal(
  estimateMonthlyCost({
    architecture: {
      ...architecture,
      components: architecture.components.map((component) =>
        component.id === "service-01" ? { ...component, config: { size: "large", instances: 2 } } : component,
      ),
    },
    registry: componentRegistry,
  }).monthlyTotal,
  8_000,
);
assert.deepEqual(
  estimateMonthlyCost({
    architecture: {
      ...architecture,
      components: [
        ...architecture.components,
        {
          id: "redis-01",
          type: "redis",
          config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
          deployments: [],
          ui: { x: 450, y: 0 },
        },
      ],
    },
    registry: componentRegistry,
  }),
  {
    monthlyTotal: 11_000,
    lineItems: [
      { componentId: "service-01", amount: 4_000 },
      { componentId: "postgres-01", amount: 4_000 },
      { componentId: "redis-01", amount: 3_000 },
    ],
  },
);
assert.equal(
  estimateMonthlyCost({
    architecture: {
      ...architecture,
      components: [
        ...architecture.components,
        {
          id: "redis-01",
          type: "redis",
          config: { mode: "replicated", tier: "medium", ttlBand: "long" },
          deployments: [],
          ui: { x: 450, y: 0 },
        },
      ],
    },
    registry: componentRegistry,
  }).monthlyTotal,
  14_000,
);
assert.throws(() => estimateMonthlyCost({ architecture: { ...architecture, components: [{ ...architecture.components[1], config: { instances: 11 } }] }, registry: componentRegistry }), CostEstimationError);
assert.throws(() => estimateMonthlyCost({ architecture: { ...architecture, components: [{ ...architecture.components[1], type: "unknown" }] }, registry: componentRegistry }), CostEstimationError);
console.log("cost estimation verified");
