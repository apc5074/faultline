import assert from "node:assert/strict";

import {
  getToolRoutingRule,
  TOOL_ROUTING_GUIDANCE,
  TOOL_ROUTING_RULES,
  validateToolRoutingAgainstProduction,
} from "../dist/index.js";

assert.equal(TOOL_ROUTING_RULES.length, 12);
assert.deepEqual(validateToolRoutingAgainstProduction(), []);
assert.deepEqual(
  TOOL_ROUTING_RULES.map((rule) => rule.intent),
  [
    "component",
    "component_position",
    "board_inventory",
    "relationship",
    "workload_path",
    "system_health",
    "requirement_failure",
    "overview",
    "cost",
    "cache",
    "replication",
    "design_interview",
  ],
);

assert.deepEqual(getToolRoutingRule("component"), {
  intent: "component",
  target: "component",
  preferredCapabilityName: "inspect_component",
  allowedFallbackCapabilityNames: ["inspect_design_entity"],
  requiresCurrentTarget: true,
  resultFrame: "component",
  selectionGuidance: "For a named current component, call inspect_component first using its exact component ID.",
  competingIntentGuidance: "If the player asks to be interviewed or quizzed, call start_design_interview instead of answering a component question.",
});
assert.equal(getToolRoutingRule("component_position").preferredCapabilityName, "inspect_component");
assert.deepEqual(getToolRoutingRule("component_position").allowedFallbackCapabilityNames, []);
assert.equal(getToolRoutingRule("board_inventory").preferredCapabilityName, "get_architecture");
assert.equal(getToolRoutingRule("board_inventory").resultFrame, "set");
assert.match(getToolRoutingRule("board_inventory").selectionGuidance, /inventory/);
assert.deepEqual(getToolRoutingRule("relationship").allowedFallbackCapabilityNames, ["get_architecture"]);
assert.deepEqual(getToolRoutingRule("workload_path").allowedFallbackCapabilityNames, ["review_current_design"]);
assert.equal(getToolRoutingRule("system_health").preferredCapabilityName, "get_metrics");
assert.equal(getToolRoutingRule("requirement_failure").preferredCapabilityName, "review_current_design");
assert.deepEqual(getToolRoutingRule("requirement_failure").positiveExamples, ["tell me about the first error", "tell me what went wrong", "Why is there an error?", "What broke?"]);
assert.match(getToolRoutingRule("requirement_failure").selectionGuidance, /primary implicated component/);
assert.match(getToolRoutingRule("requirement_failure").selectionGuidance, /focuses and zooms/);
assert.equal(getToolRoutingRule("overview").preferredCapabilityName, "review_current_design");
assert.equal(getToolRoutingRule("cost").preferredCapabilityName, "get_cost_breakdown");
assert.equal(getToolRoutingRule("cache").preferredCapabilityName, "inspect_cache");
assert.equal(getToolRoutingRule("replication").preferredCapabilityName, "inspect_replication");
assert.equal(getToolRoutingRule("design_interview").preferredCapabilityName, "start_design_interview");
assert.deepEqual(getToolRoutingRule("design_interview").allowedFallbackCapabilityNames, []);
assert.deepEqual(getToolRoutingRule("design_interview").positiveExamples.slice(0, 3), ["interview me", "quiz me on this architecture", "test me on my design"]);
assert.ok(getToolRoutingRule("design_interview").negativeExamples.includes("review my design"));
assert.match(getToolRoutingRule("component").competingIntentGuidance, /start_design_interview/);
assert.match(getToolRoutingRule("overview").competingIntentGuidance, /start_design_interview/);

for (const rule of TOOL_ROUTING_RULES) {
  assert.ok(rule.selectionGuidance.length > 0);
  assert.ok(["component", "set", "causal_path"].includes(rule.resultFrame));
}

assert.match(TOOL_ROUTING_GUIDANCE, /current-state read/);
assert.match(TOOL_ROUTING_GUIDANCE, /earlier evidence revision/);
assert.match(TOOL_ROUTING_GUIDANCE, /interview me/);
assert.match(TOOL_ROUTING_GUIDANCE, /never invent a freeform/i);
assert.match(TOOL_ROUTING_GUIDANCE, /error, failure, bottleneck/);
assert.match(TOOL_ROUTING_GUIDANCE, /requirement_failure/);
assert.match(TOOL_ROUTING_GUIDANCE, /focus-and-zoom/);
assert.match(getToolRoutingRule("design_interview").selectionGuidance, /Hard rule/);
assert.match(getToolRoutingRule("design_interview").selectionGuidance, /Never invent a freeform/);

console.log("verify-tool-routing: ok");
