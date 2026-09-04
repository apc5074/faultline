import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry,
  PRODUCTION_CAPABILITY_MANIFEST,
  PRODUCTION_CAPABILITY_MANIFEST_VERSION,
} from "../dist/index.js";

const expectedProductionTools = {
  "stable-review": [
    "review_current_design",
    "get_coaching_policy",
    "get_session_focus",
    "expand_design_evidence",
    "inspect_design_entity",
    "inspect_component_option",
    "compare_design_evidence",
    "get_architecture",
    "inspect_component",
    "estimate_capacity",
    "get_metrics",
    "get_cost_breakdown",
  ],
  specialists: [
    "inspect_cache",
    "inspect_replication",
    "inspect_regional_traffic",
    "inspect_queue",
    "inspect_processing",
    "inspect_object_storage",
    "inspect_playback_origin",
  ],
  "stable-visual": [
    "focus_component",
    "annotate_component",
    "highlight_connection",
    "clear_annotations",
  ],
  "stable-interview": [
    "start_design_interview",
    "get_design_interview",
    "submit_interview_answer",
    "follow_up_design_interview",
    "end_design_interview",
    "restart_design_interview",
    "prepare_interview_simulation_review",
    "submit_interview_simulation_critique",
  ],
};

const expectedModes = {
  review_current_design: "read",
  get_coaching_policy: "read",
  get_session_focus: "read",
  expand_design_evidence: "read",
  inspect_design_entity: "read",
  inspect_component_option: "read",
  compare_design_evidence: "read",
  get_architecture: "read",
  inspect_component: "read",
  estimate_capacity: "read",
  get_metrics: "read",
  get_cost_breakdown: "read",
  inspect_cache: "read",
  inspect_replication: "read",
  inspect_regional_traffic: "read",
  inspect_queue: "read",
  inspect_processing: "read",
  inspect_object_storage: "read",
  inspect_playback_origin: "read",
  focus_component: "visual",
  annotate_component: "visual",
  highlight_connection: "visual",
  clear_annotations: "visual",
  start_design_interview: "session",
  get_design_interview: "read",
  submit_interview_answer: "session",
  follow_up_design_interview: "session",
  end_design_interview: "session",
  restart_design_interview: "session",
  prepare_interview_simulation_review: "session",
  submit_interview_simulation_critique: "session",
};

assert.equal(PRODUCTION_CAPABILITY_MANIFEST_VERSION, "wmp-production-2");
assert.equal(
  new Set(PRODUCTION_CAPABILITY_MANIFEST.map(({ name }) => name)).size,
  PRODUCTION_CAPABILITY_MANIFEST.length,
  "each production capability must have exactly one manifest entry",
);

const registry = createDefaultCapabilityRegistry();
for (const [group, expectedNames] of Object.entries(expectedProductionTools)) {
  const entries = PRODUCTION_CAPABILITY_MANIFEST.filter((entry) => entry.group === group);
  assert.deepEqual(entries.map(({ name }) => name), expectedNames, `${group} production contract changed`);

  for (const entry of entries) {
    assert.equal(entry.production, true, `${entry.name} must be explicitly production-exposed`);
    assert.ok(registry.has(entry.name), `${entry.name} must be registered`);

    const capability = registry.get(entry.name);
    assert.deepEqual(capability.exposure, { production: true, group }, `${entry.name} exposure must match its manifest group`);
    assert.equal(capability.mode, expectedModes[entry.name], `${entry.name} mode changed`);

    if (group === "stable-review" || group === "specialists") {
      assert.equal(capability.mode, "read", `${entry.name} must be a read capability`);
      assert.equal(capability.annotations?.readOnlyHint, true, `${entry.name} must declare read-only execution`);
      assert.equal(capability.annotations?.idempotentHint, true, `${entry.name} must declare idempotent execution`);
    } else if (group === "stable-visual") {
      assert.equal(capability.mode, "visual", `${entry.name} must be a visual capability`);
      assert.equal(capability.annotations?.readOnlyHint, false, `${entry.name} must not claim to be a read`);
      assert.equal(capability.annotations?.destructiveHint, false, `${entry.name} must not mutate canonical architecture`);
    }
  }
}

assert.equal(Object.keys(expectedModes).length, PRODUCTION_CAPABILITY_MANIFEST.length, "every production tool must have an explicit expected mode");
assert.ok(
  expectedProductionTools["stable-review"].indexOf("get_coaching_policy") < expectedProductionTools["stable-review"].indexOf("get_session_focus"),
  "the required coaching bootstrap must precede the optional parallel focus read",
);

console.log("verify-production-manifest: ok");
