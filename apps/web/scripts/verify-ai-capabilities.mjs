import assert from "node:assert/strict";

import {
  BASELINE_READ_CAPABILITY_NAMES,
  BASELINE_VISUAL_CAPABILITY_NAMES,
  PHASE_8_READ_CAPABILITY_NAMES,
  createDefaultCapabilityRegistry,
  resolveCapabilities,
} from "@faultline/agent-capabilities";

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
  allowedComponentTypes: ["service", "redis", "postgres"],
};

const baselineArchitecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const redisArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    { id: "redis-1", type: "redis", config: { mode: "standalone" }, deployments: [], ui: { x: 1, y: 0 } },
  ],
};

const registry = createDefaultCapabilityRegistry();
const baselineContext = {
  challenge,
  architecture: baselineArchitecture,
  cost: { monthlyTotal: 24_000, lineItems: [{ componentId: "service-1", amount: 24_000 }] },
};

const baselineResolved = resolveCapabilities(registry, baselineContext);
const baselineTools = toAISDKTools(registry, baselineContext);

const baselineVisualNames = [...BASELINE_VISUAL_CAPABILITY_NAMES].filter((name) => name !== "focus_region" && name !== "highlight_path");
assert.deepEqual(Object.keys(baselineTools), [...baselineResolved.names, ...PHASE_8_READ_CAPABILITY_NAMES, ...baselineVisualNames]);
assert.deepEqual(baselineResolved.names, [...BASELINE_READ_CAPABILITY_NAMES]);
assert.equal("inspect_cache" in baselineTools, false);

assert.equal(baselineTools.get_challenge?.description, registry.get("get_challenge").description);
assert.deepEqual(baselineTools.inspect_component?.inputSchema.jsonSchema, {
  type: "object",
  properties: { componentId: { type: "string", minLength: 1 } },
  required: ["componentId"],
  additionalProperties: false,
});

const getChallenge = baselineTools.get_challenge?.execute;
assert.ok(getChallenge);
const result = await getChallenge(undefined, { toolCallId: "tool-1", messages: [], context: {} });
assert.deepEqual(result, await registry.invoke("get_challenge", baselineContext, undefined));

const inspect = baselineTools.inspect_component?.execute;
assert.ok(inspect);
const inspected = await inspect({ componentId: "service-1" }, { toolCallId: "tool-2", messages: [], context: {} });
assert.deepEqual(inspected, await registry.invoke("inspect_component", baselineContext, { componentId: "service-1" }));

const redisContext = { ...baselineContext, architecture: redisArchitecture };
const redisResolved = resolveCapabilities(registry, redisContext);
const redisTools = toAISDKTools(registry, redisContext);

assert.deepEqual(Object.keys(redisTools), [...redisResolved.names, ...PHASE_8_READ_CAPABILITY_NAMES, "flush_cache", ...baselineVisualNames]);
assert.deepEqual(redisResolved.names, [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache"]);
assert.equal(redisTools.inspect_cache?.description, registry.get("inspect_cache").description);

const cacheInspect = redisTools.inspect_cache?.execute;
assert.ok(cacheInspect);
const cacheResult = await cacheInspect({}, { toolCallId: "tool-3", messages: [], context: {} });
assert.deepEqual(cacheResult, await registry.invoke("inspect_cache", redisContext, {}));

const geographicTools = toAISDKTools(registry, {
  ...baselineContext,
  challenge: { ...challenge, geographicDistribution: [{ regionId: "us-east", fraction: 1 }] },
});
assert.equal("focus_region" in geographicTools, true);
assert.equal("highlight_path" in geographicTools, true);

console.log("verify-ai-capabilities: ok");
