import assert from "node:assert/strict";

import { BASELINE_READ_CAPABILITY_NAMES, createDefaultCapabilityRegistry, WMP_EVIDENCE_CONTRACT_VERSION, workloadFitFromCacheMetrics, workloadFitFromPlacement } from "@faultline/agent-capabilities";
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

function componentEvidence(metrics, workloadFit) {
  return {
    metrics: numericMetrics(metrics),
    ...(typeof metrics.state === "string" ? { state: metrics.state } : {}),
    ...(workloadFit ? { workloadFit } : {}),
  };
}

function simulationEvidence(result, challenge) {
  if (!result.valid) {
    return { available: false, validationErrors: result.errors.map((error) => error.message) };
  }

  const components = {};
  for (const [componentId, metrics] of Object.entries(result.services)) {
    components[componentId] = componentEvidence(metrics, workloadFitFromPlacement(metrics.placement));
  }
  for (const [componentId, metrics] of Object.entries(result.postgres)) {
    components[componentId] = componentEvidence(metrics, workloadFitFromPlacement(metrics.placement));
  }
  for (const [componentId, metrics] of Object.entries(result.caches)) {
    components[componentId] = componentEvidence(metrics, workloadFitFromCacheMetrics(metrics, challenge));
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
    simulation: simulationEvidence(result, challenge),
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
  if (!direct.ok) {
    assert.deepEqual(adapted, direct, `${label}: ${tool.name} adapter error must match registry.invoke`);
    return;
  }
  assert.equal(adapted.ok, true, `${label}: ${tool.name}`);
  assert.equal(adapted.data.contractVersion, WMP_EVIDENCE_CONTRACT_VERSION, `${label}: ${tool.name} must use the WMP-2 envelope`);
  assert.equal(typeof adapted.data.state.resultDigest, "string");
  assert.equal(typeof adapted.data.provenance.source, "string");
  assert.equal("evidence" in adapted.data.data, false, `${label}: ${tool.name} must not repeat provenance in payload`);
  const inner = adapted.data.data;
  if (tool.name === "inspect_component") {
    assert.equal(inner.facts.id, direct.data.id);
    assert.equal(inner.facts.type, direct.data.type);
  } else if (tool.name === "get_architecture") {
    assert.deepEqual(inner.facts.components, direct.data.components);
    assert.deepEqual(inner.facts.connections, direct.data.connections);
  } else if (tool.name === "get_coaching_policy") {
    assert.equal(inner.policyVersion, direct.data.policyVersion);
    assert.equal(inner.policyDigest, direct.data.policyDigest);
  } else if (tool.name === "get_challenge") {
    assert.equal(inner.slug, direct.data.slug);
  } else if (tool.name === "get_cost_breakdown") {
    assert.equal(inner.monthlyTotal.unit, "usd_per_month");
    assert.equal(inner.budget.unit, "usd_per_month");
    assert.ok(Math.abs(inner.monthlyTotal.value - direct.data.monthlyTotal) < 0.01);
  } else if (tool.name === "get_metrics" && direct.data.simulationAvailable !== false) {
    if (direct.data.system?.redirectP95Ms !== undefined) {
      assert.equal(inner.system.redirectP95Ms.unit, "ms");
    }
  } else if (direct.data.simulationAvailable === false) {
    assert.equal(inner.simulationAvailable, false);
  }
}

function assertToolMetadataParity(tool) {
  const capability = registry.get(tool.name);
  assert.equal(tool.name, capability.name);
  assert.ok(tool.description.length <= capability.description.length + 45);
  if (capability.mode === "experiment") assert.match(tool.description, /explicit human consent/);
  assert.deepEqual(tool.inputSchema, capability.inputSchema.jsonSchema);
  assert.equal(tool.annotations?.readOnlyHint, capability.annotations?.readOnlyHint);
  assert.equal(tool.annotations?.idempotentHint, capability.annotations?.idempotentHint);
  assert.equal(
    tool.annotations?.destructiveHint,
    capability.annotations?.destructiveHint === false ? false : undefined,
  );
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
assert.equal(afterChange.ok, true);
assert.deepEqual(
  afterChange.data.data.facts.components,
  (await registry.invoke("get_architecture", createAgentContext(validArchitecture, urlShortenerChallenge), undefined)).data.components,
);

console.log("verify-adapter-parity: ok");
