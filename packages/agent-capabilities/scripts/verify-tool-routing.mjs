import assert from "node:assert/strict";

import {
  getToolRoutingRule,
  TOOL_ROUTING_RULES,
} from "../dist/index.js";

assert.equal(TOOL_ROUTING_RULES.length, 10);
assert.deepEqual(
  TOOL_ROUTING_RULES.map((rule) => rule.intent),
  [
    "component",
    "component_position",
    "relationship",
    "workload_path",
    "system_health",
    "requirement_failure",
    "overview",
    "cost",
    "cache",
    "replication",
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
});
assert.equal(getToolRoutingRule("component_position").preferredCapabilityName, "inspect_component");
assert.deepEqual(getToolRoutingRule("component_position").allowedFallbackCapabilityNames, []);
assert.deepEqual(getToolRoutingRule("relationship").allowedFallbackCapabilityNames, ["get_architecture"]);
assert.deepEqual(getToolRoutingRule("workload_path").allowedFallbackCapabilityNames, ["review_current_design"]);
assert.equal(getToolRoutingRule("system_health").preferredCapabilityName, "get_metrics");
assert.equal(getToolRoutingRule("requirement_failure").preferredCapabilityName, "review_current_design");
assert.equal(getToolRoutingRule("overview").preferredCapabilityName, "review_current_design");
assert.equal(getToolRoutingRule("cost").preferredCapabilityName, "get_cost_breakdown");
assert.equal(getToolRoutingRule("cache").preferredCapabilityName, "inspect_cache");
assert.equal(getToolRoutingRule("replication").preferredCapabilityName, "inspect_replication");

for (const rule of TOOL_ROUTING_RULES) {
  assert.ok(rule.selectionGuidance.length > 0);
  assert.ok(["component", "set", "causal_path"].includes(rule.resultFrame));
}

console.log("verify-tool-routing: ok");
