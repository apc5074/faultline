import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry, WMP_EVIDENCE_CONTRACT_VERSION } from "@faultline/agent-capabilities";
import { toWebMcpTool, validateAgentEvidenceResult } from "../dist/index.js";

const challenge = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API.",
  developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["service", "postgres"],
};

const architecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 4 },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
  ],
  connections: [],
};

const simulation = {
  available: true,
  components: {
    "service-1": {
      metrics: {
        incomingRps: 4_000,
        capacityRps: 8_000,
        utilization: 0.5,
        headroom: 0.5,
      },
    },
  },
};

const cost = {
  monthlyTotal: 4_000,
  lineItems: [{ componentId: "service-1", amount: 4_000 }],
};

const baseContext = {
  challenge,
  architecture,
  simulation,
  cost,
  evidenceMeta: {
    architectureRevision: "rev-1",
    simulationRunId: "live-1",
    simulatorVersion: "sim-1",
    isStale: false,
    generatedAt: "now",
  },
};
const registry = createDefaultCapabilityRegistry();

let contextCalls = 0;
const getContext = () => {
  contextCalls += 1;
  return baseContext;
};

for (const capability of registry.list()) {
  const tool = toWebMcpTool(capability, { registry, getContext });

  assert.equal(tool.name, capability.name);
  assert.ok(tool.title.length > 0);
  assert.ok(tool.description.length > 0);
  if (capability.mode === "experiment") assert.match(tool.description, /explicit human consent/);
  assert.deepEqual(tool.inputSchema, capability.inputSchema.jsonSchema);
  assert.equal(tool.annotations?.readOnlyHint, capability.annotations?.readOnlyHint);
  assert.equal(tool.annotations?.untrustedContentHint, ["get_session_focus", "review_current_design", "inspect_design_entity", "inspect_component", "get_architecture", "get_cost_breakdown"].includes(capability.name) || undefined);
  assert.equal(typeof tool.execute, "function");
}

const focusMetadata = toWebMcpTool(registry.get("focus_component"), { registry, getContext });
assert.match(focusMetadata.description, /before answering/i);
assert.match(focusMetadata.description, /zooms/i);
const relationshipMetadata = toWebMcpTool(registry.get("highlight_connection"), { registry, getContext });
assert.match(relationshipMetadata.description, /relationship/i);
assert.match(relationshipMetadata.description, /frames both endpoints/i);

const inspectTool = toWebMcpTool(registry.get("inspect_component"), { registry, getContext });
const inspected = await inspectTool.execute({ componentId: "service-1" }, {});
assert.equal(contextCalls, 1);
assert.equal(inspected.ok, true);
if (inspected.ok) {
  assert.equal(inspected.data.contractVersion, WMP_EVIDENCE_CONTRACT_VERSION);
  assert.equal(inspected.data.data.facts.id, "service-1");
  validateAgentEvidenceResult(inspected.data);
}

const inspectedAgain = await inspectTool.execute({ componentId: "service-1" }, {});
assert.equal(contextCalls, 2);

const invalid = await inspectTool.execute({}, {});
assert.equal(invalid.ok, false);
if (!invalid.ok) assert.equal(invalid.code, "INVALID_INPUT");

const preAborted = new AbortController();
preAborted.abort();
const cancelled = await inspectTool.execute({ componentId: "service-1" }, { signal: preAborted.signal });
assert.equal(cancelled.ok, false);
if (!cancelled.ok) {
  assert.equal(cancelled.code, "CANCELLED");
  assert.equal("stack" in cancelled, false);
}

const getChallengeTool = toWebMcpTool(registry.get("get_challenge"), { registry, getContext });
const challengeResult = await getChallengeTool.execute(undefined, {});
assert.equal(challengeResult.ok, true);
if (challengeResult.ok) {
  assert.equal(challengeResult.data.contractVersion, WMP_EVIDENCE_CONTRACT_VERSION);
  assert.equal(challengeResult.data.data.slug, "tiny-api");
}

console.log("verify-to-webmcp-tool: ok");
