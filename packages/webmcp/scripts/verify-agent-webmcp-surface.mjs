import assert from "node:assert/strict";

import {
  WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES,
  WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES,
  createDefaultCapabilityRegistry,
} from "@faultline/agent-capabilities";
import { registerAgentWebMcpSurface } from "../dist/index.js";

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
    allowedComponentTypes: ["service"],
  },
  architecture: {
    version: 1,
    components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
    connections: [],
  },
  cost: { monthlyTotal: 0, lineItems: [] },
};

const registry = createDefaultCapabilityRegistry();
const registered = [];
const intents = [];
const controller = new AbortController();
const result = await registerAgentWebMcpSurface({
  modelContext: {
    async registerTool(tool, { signal }) {
      assert.equal(signal, controller.signal);
      registered.push(tool);
    },
  },
  registry,
  getContext: () => context,
  signal: controller.signal,
  development: true,
  onVisualIntent: (intent) => intents.push(intent),
});

assert.deepEqual(result.readToolNames, [...WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES].filter((name) => ["review_current_design", "expand_design_evidence", "inspect_component", "get_architecture", "get_metrics", "get_cost_breakdown"].includes(name)));
assert.deepEqual(result.visualToolNames, [...WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES]);
assert.deepEqual(result.registeredToolNames, [...result.readToolNames, ...result.visualToolNames]);
assert.deepEqual(result.resolvedToolNames, result.registeredToolNames);
assert.deepEqual(result.failedToolNames, []);
assert.equal(registered.length, 10);

const focusTool = registered.find((tool) => tool.name === "focus_component");
assert.ok(focusTool);
const focusResult = await focusTool.execute({ componentId: "service-1" }, {});
assert.equal(focusResult.ok, true);
assert.equal(intents.length, 1);

controller.abort();
const aborted = await registerAgentWebMcpSurface({
  modelContext: { async registerTool() {} },
  registry,
  getContext: () => context,
  signal: controller.signal,
});
assert.deepEqual(aborted, {
  resolvedToolNames: [], registeredToolNames: [], failedToolNames: [],
  readToolNames: [], visualToolNames: [], experimentToolNames: [],
});

console.log("verify-agent-webmcp-surface: ok");
