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
    requirements: [{ id: "latency", label: "Latency", type: "latency_p95", target: 100, unit: "ms", comparator: "lte" }],
    monthlyBudget: 85_000,
    allowedComponentTypes: ["service"],
  },
  architecture: {
    version: 1,
    components: [
      { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
      { id: "service-2", type: "service", config: {}, deployments: [], ui: { x: 200, y: 0 } },
    ],
    connections: [{ id: "service-path", type: "request", sourceComponentId: "service-1", sourcePortId: "out", targetComponentId: "service-2", targetPortId: "in" }],
  },
  cost: { monthlyTotal: 0, lineItems: [] },
  requirementResults: [{ id: "latency", passed: false, actual: 150, target: 100, explanation: "service-2 is the first constrained component" }],
  reviewPackets: {
    overview: { failedRequirements: [] },
    component: {},
    requirement: {
      latency: {
        result: { id: "latency", passed: false, actual: 150, target: 100, explanation: "service-2 is the first constrained component" },
        implicatedComponentIds: ["service-2"],
        caveats: [],
        relatedBottlenecks: [],
      },
    },
    workload: {},
    cost: { contributors: [], topContributors: [], budget: 85_000 },
  },
  evidenceMeta: { architectureRevision: "production-rev", simulationRunId: "live-production", simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
};

const registry = createDefaultCapabilityRegistry();
const registered = [];
const intents = [];
const presentationCues = [];
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
  onPresentationCue: (cue) => presentationCues.push(cue),
});

assert.deepEqual(result.readToolNames, [...WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES].filter((name) => ["review_current_design", "start_design_interview", "get_coaching_policy", "expand_design_evidence", "inspect_design_entity", "inspect_component_option", "compare_design_evidence", "get_architecture", "inspect_component", "estimate_capacity", "get_metrics", "get_cost_breakdown"].includes(name)));
assert.deepEqual(result.visualToolNames, [...WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES]);
assert.deepEqual(result.registeredToolNames, [...result.readToolNames, ...result.visualToolNames]);
assert.deepEqual(result.resolvedToolNames, result.registeredToolNames);
assert.deepEqual(result.failedToolNames, []);
assert.equal(registered.length, 15);

const focusTool = registered.find((tool) => tool.name === "focus_component");
assert.ok(focusTool);
const focusResult = await focusTool.execute({ componentId: "service-1" }, {});
assert.equal(focusResult.ok, true);
assert.equal(intents.length, 1);

const inspectEntityTool = registered.find((tool) => tool.name === "inspect_design_entity");
assert.ok(inspectEntityTool, "production surface exposes the targeted entity read");
const inspected = await inspectEntityTool.execute({ kind: "component", ref: "service-1" }, {});
assert.equal(inspected.ok, true);
assert.equal(presentationCues.length, 1, "production targeted read publishes a presentation cue");
assert.equal(presentationCues[0].camera, "frame-primary");
assert.deepEqual(presentationCues[0].targets.map((target) => target.entityId), ["service-1"]);

const inspectedConnection = await inspectEntityTool.execute({ kind: "connection", ref: "service-path" }, {});
assert.equal(inspectedConnection.ok, true);
assert.equal(presentationCues.length, 2, "one production relationship read publishes one grouped cue");
assert.equal(presentationCues[1].camera, "frame-path");
assert.deepEqual(presentationCues[1].targets.map((target) => target.entityId), ["service-path", "service-1", "service-2"]);

const reviewTool = registered.find((tool) => tool.name === "review_current_design");
assert.ok(reviewTool);
const compactReview = await reviewTool.execute({
  intent: "component_review",
  targetId: "service-1",
  knownEvidenceRevision: "production-rev",
}, {});
assert.equal(compactReview.ok, true);
assert.equal(presentationCues.length, 3, "known-revision optimization retains the requested visual subject");
assert.equal(presentationCues[2].targets[0].entityId, "service-1");

const compactFailure = await reviewTool.execute({
  intent: "requirement_failure",
  knownEvidenceRevision: "production-rev",
}, {});
assert.equal(compactFailure.ok, true);
assert.equal(presentationCues.length, 4, "unchanged first-error review still publishes its grounded location");
assert.equal(presentationCues[3].reason, "error-location");
assert.equal(presentationCues[3].targets[0].entityId, "service-2");

controller.abort();
const aborted = await registerAgentWebMcpSurface({
  modelContext: { async registerTool() {} },
  registry,
  getContext: () => context,
  signal: controller.signal,
});
assert.deepEqual(aborted, {
  resolvedToolNames: [], registeredToolNames: [], failedToolNames: [],
  readToolNames: [], visualToolNames: [],
  sessionToolNames: [],
});

console.log("verify-agent-webmcp-surface: ok");
