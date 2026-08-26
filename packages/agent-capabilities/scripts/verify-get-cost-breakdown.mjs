import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry,
  getCostBreakdown,
  getCostBreakdownCapability,
} from "../dist/index.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service", "cdn"],
};

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "cdn-1", type: "cdn", config: {}, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [],
};

assert.equal(getCostBreakdownCapability.name, "get_cost_breakdown");
assert.equal(getCostBreakdownCapability.mode, "read");

const context = {
  challenge,
  architecture,
  cost: {
    monthlyTotal: 71_400,
    lineItems: [
      { componentId: "service-1", amount: 24_000 },
      { componentId: "cdn-1", amount: 12_400 },
      { componentId: "transfer:us-east:europe", label: "Cross-region transfer", amount: 35_000 },
    ],
  },
};

const result = getCostBreakdown(context);
assert.equal(result.ok, true);
if (result.ok) {
  assert.deepEqual(result.data, {
    monthlyTotal: 71_400,
    budget: 85_000,
    remainingBudget: 13_600,
    overBudget: false,
    lineItems: [
      { componentId: "cdn-1", label: "cdn", monthlyCost: 12_400 },
      { componentId: "service-1", label: "service", monthlyCost: 24_000 },
      {
        componentId: "transfer:us-east:europe",
        label: "Cross-region transfer",
        monthlyCost: 35_000,
      },
    ],
  });
}

const overBudget = getCostBreakdown({
  ...context,
  cost: { monthlyTotal: 86_000, lineItems: [] },
});
assert.equal(overBudget.ok, true);
if (overBudget.ok) {
  assert.equal(overBudget.data.remainingBudget, -1_000);
  assert.equal(overBudget.data.overBudget, true);
}

const unavailable = getCostBreakdown({ challenge, architecture });
assert.equal(unavailable.ok, false);
if (!unavailable.ok) assert.equal(unavailable.code, "SIMULATION_UNAVAILABLE");

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_cost_breakdown"));
const invoked = await registry.invoke("get_cost_breakdown", context, undefined);
assert.equal(invoked.ok, true);
if (invoked.ok && result.ok) assert.deepEqual(invoked.data, result.data);

const invalid = await registry.invoke("get_cost_breakdown", context, { unexpected: true });
assert.equal(invalid.ok, false);
if (!invalid.ok) assert.equal(invalid.code, "INVALID_INPUT");

console.log("verify-get-cost-breakdown: ok");
