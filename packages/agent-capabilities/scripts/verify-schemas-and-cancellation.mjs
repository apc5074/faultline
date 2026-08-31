import assert from "node:assert/strict";

import {
  createAgentCapabilityRegistry,
  createDefaultCapabilityRegistry,
  estimateCapacityInputSchema,
  inspectComponentInputSchema,
  noInputSchema,
} from "../dist/index.js";

const defaultRegistry = createDefaultCapabilityRegistry();
const phase5Names = [
  "get_challenge",
  "get_requirements",
  "get_architecture",
  "inspect_design_entity",
  "inspect_component",
  "estimate_capacity",
  "get_metrics",
  "get_cost_breakdown",
];

for (const name of phase5Names) {
  const capability = defaultRegistry.get(name);
  const serialized = JSON.stringify(capability.inputSchema.jsonSchema);
  assert.ok(serialized.length > 0, `${name} must expose serializable JSON Schema`);
  assert.deepEqual(JSON.parse(serialized), capability.inputSchema.jsonSchema);
}

assert.deepEqual(noInputSchema.jsonSchema, {
  type: "object",
  properties: {},
  additionalProperties: false,
});
assert.equal(noInputSchema.safeParse(undefined).success, true);
assert.equal(noInputSchema.safeParse(null).success, true);
assert.equal(noInputSchema.safeParse({}).success, true);
assert.equal(noInputSchema.safeParse({ extra: true }).success, false);

assert.deepEqual(inspectComponentInputSchema.jsonSchema, {
  type: "object",
  properties: {
    componentId: { type: "string", minLength: 1 },
    selector: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["traffic-source", "service", "postgres", "redis", "global-router", "load-balancer", "cdn", "object-storage", "queue", "worker"],
        },
        scope: { type: "string", enum: ["all", "topmost"] },
      },
      required: ["type", "scope"],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
});
assert.equal(inspectComponentInputSchema.safeParse({ componentId: "svc-1" }).success, true);
assert.equal(inspectComponentInputSchema.safeParse({ selector: { type: "postgres", scope: "all" } }).success, true);
assert.equal(inspectComponentInputSchema.safeParse({}).success, false);
assert.equal(inspectComponentInputSchema.safeParse({ componentId: "" }).success, false);
assert.equal(inspectComponentInputSchema.safeParse({ selector: { type: "DB", scope: "all" } }).success, false);
assert.equal(inspectComponentInputSchema.safeParse({ selector: { type: "postgres", scope: "nearest" } }).success, false);
assert.equal(inspectComponentInputSchema.safeParse({ componentId: "svc-1", extra: true }).success, false);

assert.deepEqual(estimateCapacityInputSchema.jsonSchema, {
  type: "object",
  properties: { componentId: { type: "string", minLength: 1 } },
  additionalProperties: false,
});
assert.equal(estimateCapacityInputSchema.safeParse(undefined).success, true);
assert.equal(estimateCapacityInputSchema.safeParse({}).success, true);
assert.equal(estimateCapacityInputSchema.safeParse({ componentId: "svc-1" }).success, true);
assert.equal(estimateCapacityInputSchema.safeParse({ componentId: "" }).success, false);

const challenge = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API.",
  developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["service"],
};

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const context = { challenge, architecture };

const preAborted = new AbortController();
preAborted.abort();
const cancelledBeforeInvoke = await defaultRegistry.invoke("get_challenge", context, undefined, {
  signal: preAborted.signal,
});
assert.equal(cancelledBeforeInvoke.ok, false);
if (!cancelledBeforeInvoke.ok) {
  assert.equal(cancelledBeforeInvoke.code, "CANCELLED");
  assert.match(cancelledBeforeInvoke.message, /cancel/i);
  assert.equal("stack" in cancelledBeforeInvoke, false);
}

let executeCalls = 0;
const slowRegistry = createAgentCapabilityRegistry([
  {
    name: "test_slow_read",
    description: "Async fixture for cancellation verification.",
    inputSchema: noInputSchema,
    mode: "read",
    availableWhen: () => true,
    async execute() {
      executeCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { ok: true, data: { done: true } };
    },
  },
]);

const abortDuring = new AbortController();
const pending = slowRegistry.invoke("test_slow_read", context, undefined, { signal: abortDuring.signal });
setTimeout(() => abortDuring.abort(), 5);
const cancelledDuring = await pending;
assert.equal(executeCalls, 1);
assert.equal(cancelledDuring.ok, false);
if (!cancelledDuring.ok) {
  assert.equal(cancelledDuring.code, "CANCELLED");
  assert.equal("stack" in cancelledDuring, false);
}

console.log("verify-schemas-and-cancellation: ok");
