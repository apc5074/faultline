import assert from "node:assert/strict";

import {
  BASELINE_READ_CAPABILITY_NAMES,
  createDefaultCapabilityRegistry,
  resolveCapabilities,
} from "@faultline/agent-capabilities";
import { buildPhase6ReadSurface, toWebMcpTool } from "@faultline/webmcp";

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

const oneRedisArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    { id: "redis-1", type: "redis", config: { mode: "standalone", tier: "medium" }, deployments: [], ui: { x: 1, y: 0 } },
  ],
};

const twoRedisArchitecture = {
  ...oneRedisArchitecture,
  components: [
    ...oneRedisArchitecture.components,
    { id: "redis-2", type: "redis", config: { mode: "standalone", tier: "large" }, deployments: [], ui: { x: 2, y: 0 } },
  ],
};

const replicaArchitecture = {
  ...baselineArchitecture,
  components: [
    ...baselineArchitecture.components,
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [],
      ui: { x: 3, y: 0 },
    },
  ],
};

const fullStackArchitecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 6 },
      deployments: [
        { id: "svc-east", regionId: "us-east", config: { instances: 3 } },
        { id: "svc-eu", regionId: "europe", config: { instances: 3 } },
      ],
      ui: { x: 0, y: 0 },
    },
    {
      id: "redis-1",
      type: "redis",
      config: { mode: "standalone", tier: "medium" },
      deployments: [{ id: "redis-eu", regionId: "europe", config: {} }],
      ui: { x: 1, y: 0 },
    },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [
        { id: "pg-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "pg-replica", regionId: "europe", config: { role: "replica" } },
      ],
      ui: { x: 2, y: 0 },
    },
  ],
  connections: [],
};

const multiRegionReducedArchitecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 6 },
      deployments: [{ id: "svc-east", regionId: "us-east", config: { instances: 6 } }],
      ui: { x: 0, y: 0 },
    },
    {
      id: "redis-1",
      type: "redis",
      config: { mode: "standalone", tier: "medium" },
      deployments: [{ id: "redis-east", regionId: "us-east", config: {} }],
      ui: { x: 1, y: 0 },
    },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [],
      ui: { x: 2, y: 0 },
    },
  ],
  connections: [],
};

const redisRemovedArchitecture = structuredClone(baselineArchitecture);

const invalidSimulationArchitecture = {
  version: 1,
  components: [
    {
      id: "traffic-source-start",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
  ],
  connections: [],
};

const simulation = {
  available: true,
  components: {
    "service-1": { metrics: { utilization: 0.5, incomingRps: 4_000, capacityRps: 8_000 } },
    "redis-1": { metrics: { hitRate: 0.8, utilization: 0.6 } },
    "redis-2": { metrics: { hitRate: 0.7, utilization: 0.5 } },
    "postgres-1": {
      metrics: {
        readRps: 9_000,
        primaryReadRps: 3_000,
        replicaReadRps: 6_000,
        readUtilization: 0.54,
        writeUtilization: 0.22,
        readReplicaCount: 2,
      },
    },
  },
};

const invalidSimulation = {
  available: false,
  validationErrors: ["No path from traffic-source to service."],
};

const cost = {
  monthlyTotal: 24_000,
  lineItems: [
    { componentId: "service-1", amount: 8_000 },
    { componentId: "redis-1", amount: 3_000 },
    { componentId: "postgres-1", amount: 5_000 },
  ],
};

const fixtures = [
  {
    id: "baseline",
    architecture: baselineArchitecture,
    context: { challenge, architecture: baselineArchitecture, simulation, cost },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES],
  },
  {
    id: "one-redis",
    architecture: oneRedisArchitecture,
    context: { challenge, architecture: oneRedisArchitecture, simulation, cost },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache"],
  },
  {
    id: "two-redis",
    architecture: twoRedisArchitecture,
    context: { challenge, architecture: twoRedisArchitecture, simulation, cost },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache"],
  },
  {
    id: "postgres-replica",
    architecture: replicaArchitecture,
    context: { challenge, architecture: replicaArchitecture, simulation, cost },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES, "inspect_replication"],
  },
  {
    id: "full-stack",
    architecture: fullStackArchitecture,
    context: { challenge, architecture: fullStackArchitecture, simulation, cost },
    expectedNames: [
      ...BASELINE_READ_CAPABILITY_NAMES,
      "inspect_cache",
      "inspect_replication",
      "inspect_regional_traffic",
    ],
  },
  {
    id: "multi-region-reduced",
    architecture: multiRegionReducedArchitecture,
    context: { challenge, architecture: multiRegionReducedArchitecture, simulation, cost },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES, "inspect_cache", "inspect_replication"],
  },
  {
    id: "redis-removed",
    architecture: redisRemovedArchitecture,
    context: { challenge, architecture: redisRemovedArchitecture, simulation, cost },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES],
  },
  {
    id: "invalid-simulation",
    architecture: invalidSimulationArchitecture,
    context: { challenge, architecture: invalidSimulationArchitecture, simulation: invalidSimulation },
    expectedNames: [...BASELINE_READ_CAPABILITY_NAMES],
  },
];

const registry = createDefaultCapabilityRegistry();

function assertToolMetadataParity({ label, capability, webTool, aiTool }) {
  assert.equal(webTool.name, capability.name, `${label}: web name`);
  assert.equal(aiTool.description, capability.description, `${label}: ai description`);
  assert.equal(webTool.description, capability.description, `${label}: web description`);
  assert.deepEqual(webTool.inputSchema, capability.inputSchema.jsonSchema, `${label}: web schema`);
  assert.deepEqual(aiTool.inputSchema.jsonSchema, capability.inputSchema.jsonSchema, `${label}: ai schema`);
  assert.equal(webTool.annotations?.readOnlyHint, capability.annotations?.readOnlyHint, `${label}: web readOnly`);
  assert.equal(webTool.annotations?.idempotentHint, capability.annotations?.idempotentHint, `${label}: web idempotent`);
  assert.equal(webTool.annotations?.destructiveHint, undefined, `${label}: web destructive`);
}

async function assertAdapterParity({ label, context, webTool, aiTool, input }) {
  const direct = await registry.invoke(webTool.name, context, input);
  const web = await webTool.execute(input, {});
  const ai = await aiTool.execute(input, { toolCallId: `${label}-tool`, messages: [], context: {} });
  assert.deepEqual(web, direct, `${label}: web result`);
  assert.deepEqual(ai, direct, `${label}: ai result`);
}

async function assertFixtureParity(fixture) {
  const { id, context, expectedNames } = fixture;
  const resolved = resolveCapabilities(registry, context, { development: true });
  assert.deepEqual(resolved.names, expectedNames, `${id}: resolver names`);

  const aiTools = toAISDKTools(registry, context, { development: true });
  assert.deepEqual(Object.keys(aiTools), expectedNames, `${id}: embedded AI tool names`);

  const webSurface = await buildPhase6ReadSurface({
    registry,
    getContext: () => context,
    development: true,
  });
  assert.deepEqual(webSurface.resolvedNames, expectedNames, `${id}: WebMCP resolved names`);
  assert.deepEqual(
    webSurface.tools.map((tool) => tool.name),
    expectedNames,
    `${id}: WebMCP tool order`,
  );

  for (const name of expectedNames) {
    const capability = registry.get(name);
    const webTool = webSurface.tools.find((tool) => tool.name === name);
    const aiTool = aiTools[name];
    assert.ok(webTool, `${id}: missing web tool ${name}`);
    assert.ok(aiTool, `${id}: missing ai tool ${name}`);
    assertToolMetadataParity({ label: `${id}:${name}`, capability, webTool, aiTool });
  }

  const inspectComponent = webSurface.tools.find((tool) => tool.name === "inspect_component");
  if (inspectComponent && context.architecture.components.some((component) => component.id === "service-1")) {
    await assertAdapterParity({
      label: `${id}:inspect_component`,
      context,
      webTool: inspectComponent,
      aiTool: aiTools.inspect_component,
      input: { componentId: "service-1" },
    });
  }
}

for (const fixture of fixtures) {
  await assertFixtureParity(fixture);
}

// Selector ambiguity and invented IDs stay controlled across adapters.
const ambiguousContext = {
  challenge,
  architecture: twoRedisArchitecture,
  simulation,
  cost,
};
const ambiguousDirect = await registry.invoke("inspect_cache", ambiguousContext, {});
const ambiguousWeb = await toWebMcpTool(registry.get("inspect_cache"), {
  registry,
  getContext: () => ambiguousContext,
}).execute({}, {});
const ambiguousAi = await toAISDKTools(registry, ambiguousContext).inspect_cache.execute({}, {
  toolCallId: "ambiguous",
  messages: [],
  context: {},
});
assert.equal(ambiguousDirect.ok, false);
assert.deepEqual(ambiguousWeb, ambiguousDirect);
assert.deepEqual(ambiguousAi, ambiguousDirect);
if (!ambiguousDirect.ok) assert.equal(ambiguousDirect.code, "INVALID_INPUT");

const inventedDirect = await registry.invoke("inspect_cache", ambiguousContext, { componentId: "missing-redis" });
const inventedWeb = await toWebMcpTool(registry.get("inspect_cache"), {
  registry,
  getContext: () => ambiguousContext,
}).execute({ componentId: "missing-redis" }, {});
assert.equal(inventedDirect.ok, false);
assert.deepEqual(inventedWeb, inventedDirect);
if (!inventedDirect.ok) assert.equal(inventedDirect.code, "NOT_FOUND");

// Stale WebMCP invocation after capability removal returns controlled NOT_FOUND.
const staleTool = toWebMcpTool(registry.get("inspect_cache"), {
  registry,
  getContext: () => ({ challenge, architecture: baselineArchitecture, simulation, cost }),
});
const staleResult = await staleTool.execute({}, {});
assert.equal(staleResult.ok, false);
if (!staleResult.ok) assert.equal(staleResult.code, "NOT_FOUND");

// Pre-aborted WebMCP signal must not mutate architecture through getContext.
{
  let contextCalls = 0;
  const tool = toWebMcpTool(registry.get("get_challenge"), {
    registry,
    getContext: async () => {
      contextCalls += 1;
      return fixtures[0].context;
    },
  });
  const controller = new AbortController();
  controller.abort();
  const cancelled = await tool.execute(undefined, { signal: controller.signal });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.code, "CANCELLED");
  assert.equal(contextCalls, 0);
}

// Invalid simulation still resolves baseline tools; dynamic inspect_cache absent without Redis.
const invalidContext = fixtures.find((fixture) => fixture.id === "invalid-simulation").context;
const invalidMetrics = await registry.invoke("get_metrics", invalidContext, undefined);
const invalidWeb = await buildPhase6ReadSurface({
  registry,
  getContext: () => invalidContext,
  development: true,
});
const invalidMetricsTool = invalidWeb.tools.find((tool) => tool.name === "get_metrics");
assert.ok(invalidMetricsTool);
const invalidAdapted = await invalidMetricsTool.execute(undefined, {});
assert.deepEqual(invalidAdapted, invalidMetrics);
assert.equal(invalidMetrics.ok, true);
if (invalidMetrics.ok) {
  assert.equal("simulationAvailable" in invalidMetrics.data && invalidMetrics.data.simulationAvailable, false);
}

console.log("verify-dynamic-surface-parity: ok");
