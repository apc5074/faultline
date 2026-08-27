import assert from "node:assert/strict";

import { BASELINE_READ_CAPABILITY_NAMES, createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "@faultline/simulator";

import { buildPhase6ReadSurface } from "../dist/index.js";

function createLiveAgentContextFactory(source) {
  return () => createAgentContext(source.getArchitecture(), source.getChallenge());
}

function numericMetrics(value) {
  const metrics = {};
  for (const [name, metric] of Object.entries(value)) {
    if (typeof metric === "number" && Number.isFinite(metric)) metrics[name] = metric;
  }
  return metrics;
}

function simulationEvidence(result) {
  if (!result.valid) {
    return { available: false, validationErrors: result.errors.map((error) => error.message) };
  }

  const components = {};
  for (const [componentId, metrics] of Object.entries(result.services)) {
    components[componentId] = { metrics: numericMetrics(metrics), state: metrics.state };
  }
  for (const [componentId, metrics] of Object.entries(result.postgres)) {
    components[componentId] = { metrics: numericMetrics(metrics), state: metrics.state };
  }
  for (const [componentId, metrics] of Object.entries(result.caches)) {
    components[componentId] = { metrics: numericMetrics(metrics) };
  }

  const throughput = result.requirements.find((requirement) => requirement.type === "throughput");
  return {
    available: true,
    components,
    system: {
      redirectP95Ms: result.p95LatencyMs,
      throughputPass: throughput?.passed,
      minimumHeadroom: result.headroom,
    },
    scenarios: { hotKey: { active: result.hotKey.active, passed: result.hotKey.passed } },
  };
}

function createAgentContext(architecture, challenge) {
  const result = evaluateRequirements({ architecture, challenge, registry: componentRegistry });
  return {
    challenge,
    architecture,
    simulation: simulationEvidence(result),
    ...(result.valid ? { cost: result.cost } : {}),
    user: { authenticated: false },
  };
}

const incompleteArchitecture = {
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

const validArchitecture = {
  version: 1,
  components: [
    {
      id: "traffic-01",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
    { id: "router-01", type: "global-router", config: {}, deployments: [], ui: { x: 120, y: 0 } },
    {
      id: "service-01",
      type: "service",
      config: { size: "large", instances: 6 },
      deployments: [{ id: "svc-east", regionId: "us-east", config: { instances: 6 } }],
      ui: { x: 300, y: 0 },
    },
    {
      id: "postgres-01",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [
        { id: "pg-east", regionId: "us-east", config: { role: "primary" } },
        { id: "pg-eu", regionId: "europe", config: { role: "replica" } },
      ],
      ui: { x: 480, y: 0 },
    },
  ],
  connections: [
    {
      id: "t-r",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "router-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "r-s",
      sourceComponentId: "router-01",
      sourcePortId: "route_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "s-pg",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const validSimulation = evaluateRequirements({
  architecture: validArchitecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(validSimulation.valid, true, "validArchitecture must simulate for adapter parity coverage");

const validContext = createAgentContext(validArchitecture, urlShortenerChallenge);
const invalidContext = createAgentContext(incompleteArchitecture, urlShortenerChallenge);
assert.equal(validContext.simulation?.available, true);
assert.equal(invalidContext.simulation?.available, false);

const registry = createDefaultCapabilityRegistry();

async function assertParity({ tool, context, input, label }) {
  const direct = await registry.invoke(tool.name, context, input);
  const adapted = await tool.execute(input, {});
  assert.deepEqual(adapted, direct, `${label}: ${tool.name} adapter result must match registry.invoke`);
}

function assertToolMetadataParity(tool) {
  const capability = registry.get(tool.name);
  assert.equal(tool.name, capability.name);
  assert.equal(tool.description, capability.description);
  assert.deepEqual(tool.inputSchema, capability.inputSchema.jsonSchema);
  assert.equal(tool.annotations?.readOnlyHint, capability.annotations?.readOnlyHint);
  assert.equal(tool.annotations?.idempotentHint, capability.annotations?.idempotentHint);
  assert.equal(tool.annotations?.destructiveHint, undefined);
}

async function buildSurface(getContext) {
  return buildPhase6ReadSurface({ registry, getContext, development: true });
}

const validSurface = await buildSurface(() => validContext);
assert.ok(validSurface.tools.length >= BASELINE_READ_CAPABILITY_NAMES.length);
assert.deepEqual(
  validSurface.resolvedNames.slice(0, BASELINE_READ_CAPABILITY_NAMES.length),
  [...BASELINE_READ_CAPABILITY_NAMES],
);
assert.ok(validSurface.resolvedNames.includes("inspect_replication"));
assert.ok(validSurface.resolvedNames.includes("inspect_regional_traffic"));

for (const tool of validSurface.tools) {
  assertToolMetadataParity(tool);
}

const noInputTools = [
  "get_coaching_policy",
  "get_session_focus",
  "get_challenge",
  "get_requirements",
  "get_architecture",
  "get_metrics",
  "get_cost_breakdown",
];
for (const name of noInputTools) {
  const tool = validSurface.tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  await assertParity({ tool, context: validContext, input: undefined, label: "valid" });
}

const inspectTool = validSurface.tools.find((tool) => tool.name === "inspect_component");
assert.ok(inspectTool);
await assertParity({
  tool: inspectTool,
  context: validContext,
  input: { componentId: "service-01" },
  label: "valid inspect known",
});
await assertParity({
  tool: inspectTool,
  context: validContext,
  input: { componentId: "missing-component" },
  label: "valid inspect missing",
});

const estimateTool = validSurface.tools.find((tool) => tool.name === "estimate_capacity");
assert.ok(estimateTool);
await assertParity({ tool: estimateTool, context: validContext, input: {}, label: "valid estimate" });
await assertParity({
  tool: estimateTool,
  context: validContext,
  input: { componentId: "service-01" },
  label: "valid estimate component",
});

const invalidSurface = await buildSurface(() => invalidContext);
const invalidEstimate = invalidSurface.tools.find((tool) => tool.name === "estimate_capacity");
assert.ok(invalidEstimate);
await assertParity({
  tool: invalidEstimate,
  context: invalidContext,
  input: {},
  label: "invalid estimate",
});

const invalidMetrics = invalidSurface.tools.find((tool) => tool.name === "get_metrics");
assert.ok(invalidMetrics);
await assertParity({
  tool: invalidMetrics,
  context: invalidContext,
  input: undefined,
  label: "invalid metrics",
});

let currentArchitecture = structuredClone(incompleteArchitecture);
const liveFactory = createLiveAgentContextFactory({
  getArchitecture: () => currentArchitecture,
  getChallenge: () => urlShortenerChallenge,
});
const liveSurface = await buildSurface(liveFactory);
const architectureTool = liveSurface.tools.find((tool) => tool.name === "get_architecture");
assert.ok(architectureTool);

const beforeChange = await architectureTool.execute(undefined, {});
currentArchitecture = structuredClone(validArchitecture);
const afterChange = await architectureTool.execute(undefined, {});
assert.notDeepEqual(beforeChange, afterChange, "fresh context factory must observe architecture edits");
assert.deepEqual(
  afterChange,
  await registry.invoke("get_architecture", createAgentContext(validArchitecture, urlShortenerChallenge), undefined),
);

console.log("verify-adapter-parity: ok");
