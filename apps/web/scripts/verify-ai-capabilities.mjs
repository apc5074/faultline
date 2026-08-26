import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";

import { toAISDKTools } from "../lib/ai/capabilities.ts";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service"],
};

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const registry = createDefaultCapabilityRegistry();
const context = {
  challenge,
  architecture,
  cost: { monthlyTotal: 24_000, lineItems: [{ componentId: "service-1", amount: 24_000 }] },
};
const tools = toAISDKTools(registry, context);


assert.deepEqual(Object.keys(tools).sort(), registry.available(context).map((capability) => capability.name).sort());
assert.equal(tools.get_challenge?.description, registry.get("get_challenge").description);
assert.deepEqual(tools.inspect_component?.inputSchema.jsonSchema, {
  type: "object",
  properties: { componentId: { type: "string", minLength: 1 } },
  required: ["componentId"],
  additionalProperties: false,
});

const getChallenge = tools.get_challenge?.execute;
assert.ok(getChallenge);
const result = await getChallenge(undefined, { toolCallId: "tool-1", messages: [], context: {} });
assert.deepEqual(result, await registry.invoke("get_challenge", context, undefined));

const inspect = tools.inspect_component?.execute;
assert.ok(inspect);
const inspected = await inspect({ componentId: "service-1" }, { toolCallId: "tool-2", messages: [], context: {} });
assert.deepEqual(inspected, await registry.invoke("inspect_component", context, { componentId: "service-1" }));

console.log("verify-ai-capabilities: ok");
