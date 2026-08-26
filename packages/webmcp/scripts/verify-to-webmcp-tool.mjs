import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { toWebMcpTool } from "../dist/to-webmcp-tool.js";

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

const baseContext = { challenge, architecture, simulation, cost };
const registry = createDefaultCapabilityRegistry();

let contextCalls = 0;
const getContext = () => {
  contextCalls += 1;
  return baseContext;
};

for (const capability of registry.list()) {
  const tool = toWebMcpTool(capability, { registry, getContext });

  assert.equal(tool.name, capability.name);
  assert.equal(tool.description, capability.description);
  assert.deepEqual(tool.inputSchema, capability.inputSchema.jsonSchema);
  assert.deepEqual(tool.annotations, capability.annotations);
  assert.equal(typeof tool.execute, "function");
}

const inspectTool = toWebMcpTool(registry.get("inspect_component"), { registry, getContext });
const inspected = await inspectTool.execute({ componentId: "service-1" }, {});
assert.equal(contextCalls, 1);
assert.deepEqual(inspected, await registry.invoke("inspect_component", baseContext, { componentId: "service-1" }));

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
  assert.equal(challengeResult.data.slug, "tiny-api");
}

console.log("verify-to-webmcp-tool: ok");
