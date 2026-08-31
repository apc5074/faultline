import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { createWebMcpTrace, toWebMcpTool } from "../dist/index.js";

const context = {
  challenge: {
    slug: "url-shortener",
    version: 1,
    title: "Global URL Shortener",
    prompt: "Design",
    developmentOnly: false,
    workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
    requirements: [],
    monthlyBudget: 85_000,
    allowedComponentTypes: ["service", "postgres"],
  },
  architecture: {
    version: 1,
    components: [
      { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
      { id: "postgres-1", type: "postgres", config: {}, deployments: [], ui: { x: 1, y: 1 } },
    ],
    connections: [],
  },
  simulation: {
    available: true,
    components: { "service-1": { metrics: { utilization: 0.5 } }, "postgres-1": { metrics: { utilization: 0.4 } } },
  },
  cost: { monthlyTotal: 0, lineItems: [] },
  requirementResults: [],
  evidenceMeta: { architectureRevision: "direct-routing", simulationRunId: "run-1", simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
};

const registry = createDefaultCapabilityRegistry();
const trace = createWebMcpTrace(64);

async function invokeDirect(name, input) {
  trace.clear();
  const tool = toWebMcpTool(registry.get(name), {
    registry,
    getContext: () => context,
    trace: trace.sink,
    traceGroup: "stable-review",
    onPresentationCue: () => {},
  });
  const result = await tool.execute(input, {});
  assert.equal(result.ok, true, `${name} should resolve directly: ${JSON.stringify(result)}`);
  const invoked = trace.events.filter((event) => event.name === "tool_invoked");
  assert.equal(invoked.length, 1);
  assert.equal(invoked[0].capability, name);
  assert.equal(trace.events.some((event) => event.capability === "review_current_design"), false);
  return { tool, result };
}

const component = await invokeDirect("inspect_component", { componentId: "service-1" });
assert.match(component.tool.description, /componentId/);
const selection = await invokeDirect("inspect_component", { selector: { type: "postgres", scope: "all" } });
assert.match(selection.tool.description, /scope: "all" \| "topmost"/);
const metrics = await invokeDirect("get_metrics", undefined);
assert.match(metrics.tool.description, /first for health/);

const reviewTool = toWebMcpTool(registry.get("review_current_design"), { registry, getContext: () => context });
assert.match(reviewTool.description, /overview/);
assert.match(reviewTool.description, /direct evidence/);

console.log("verify-direct-routing: ok");
