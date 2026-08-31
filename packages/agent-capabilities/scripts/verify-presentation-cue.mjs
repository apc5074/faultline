import assert from "node:assert/strict";
import {
  createPresentationCue,
  createScopedEntityReference,
  PRESENTATION_CUE_CONTRACT_VERSION,
  presentationCueForCapability,
  validatePresentationCue,
} from "../dist/index.js";

const revision = "evidence-001";
const candidates = {
  component: ["router", "service", "redis"],
  connection: ["router-service", "service-redis"],
};

const cue = createPresentationCue(
  {
    kind: "path",
    targets: ["router", "service", "service-redis", "service-redis", "missing"],
    primaryTarget: "service",
    reason: "causal-path",
    camera: "none",
  },
  revision,
  candidates,
);

assert.ok(cue);
assert.equal(cue.contractVersion, PRESENTATION_CUE_CONTRACT_VERSION);
assert.deepEqual(cue.targets.map((target) => target.entityId), ["router", "service", "service-redis"]);
assert.equal(cue.targets.filter((target) => target.emphasis === "primary").length, 1);
assert.equal(cue.targets.find((target) => target.entityId === "service")?.emphasis, "primary");
assert.ok(validatePresentationCue(JSON.parse(JSON.stringify(cue)), revision));

const cappedPath = createPresentationCue(
  { kind: "path", targets: ["router", "service", "redis", "component-4", "component-5", "component-6"] },
  revision,
  { ...candidates, component: ["router", "service", "redis", "component-4", "component-5", "component-6"] },
);
assert.equal(cappedPath?.targets.filter((target) => target.kind === "component").length, 5);

const stale = {
  ...cue,
  targets: cue.targets.map((target) => ({ ...target, evidenceRevision: "evidence-old" })),
};
assert.equal(validatePresentationCue(stale, revision), false);
assert.equal(validatePresentationCue({ ...cue, targets: [] }, revision), false);
assert.equal(
  createPresentationCue({ kind: "spotlight", targets: ["missing"] }, revision, candidates),
  undefined,
);

const duplicate = {
  ...cue,
  targets: [cue.targets[0], cue.targets[0]],
};
assert.equal(validatePresentationCue(duplicate, revision), false);
assert.equal(createScopedEntityReference("component", "router", revision).evidenceRevision, revision);

const context = {
  architecture: {
    components: [{ id: "service", deployments: [] }],
    connections: [],
  },
  challenge: { requirements: [] },
  evidenceMeta: { architectureRevision: revision },
  simulation: { available: false },
};
const grounded = presentationCueForCapability(
  "review_current_design",
  { focus: { focus: { kind: "component", componentId: "service" } }, explanation: "ignored prose" },
  context,
);
assert.equal(grounded?.targets[0]?.entityId, "service");
assert.equal(grounded?.targets[0]?.emphasis, "primary");
assert.equal(grounded?.camera, "frame-primary");
const errorCue = presentationCueForCapability(
  "review_current_design",
  { focus: { kind: "requirement", requirementId: "latency" }, requirement: { implicatedComponentIds: ["service"] } },
  { ...context, challenge: { requirements: [{ id: "latency" }] } },
);
assert.equal(errorCue?.camera, "frame-primary");
assert.equal(errorCue?.reason, "error-location");
assert.equal(errorCue?.targets[0]?.entityId, "service");

const unfocusedFailureCue = presentationCueForCapability(
  "review_current_design",
  { summary: { failedRequirements: [{ id: "latency", passed: false }] } },
  {
    ...context,
    challenge: { requirements: [{ id: "latency" }] },
    reviewPackets: { requirement: { latency: { result: { id: "latency", passed: false }, implicatedComponentIds: ["service"], caveats: [], relatedBottlenecks: [] } } },
    simulation: { available: false },
  },
);
assert.equal(unfocusedFailureCue?.reason, "error-location");
assert.equal(unfocusedFailureCue?.targets[0]?.entityId, "service");

const compactComponentCue = presentationCueForCapability(
  "review_current_design",
  { unchanged: true },
  context,
  { intent: "component_review", targetId: "service", knownEvidenceRevision: revision },
);
assert.equal(compactComponentCue?.camera, "frame-primary");
assert.equal(compactComponentCue?.targets[0]?.entityId, "service", "request target survives compact unchanged evidence");

const compactFailureCue = presentationCueForCapability(
  "review_current_design",
  { unchanged: true },
  {
    ...context,
    challenge: { requirements: [{ id: "latency" }] },
    requirementResults: [{ id: "latency", passed: false }],
    reviewPackets: { requirement: { latency: { result: { id: "latency", passed: false }, implicatedComponentIds: ["service"], caveats: [], relatedBottlenecks: [] } } },
  },
  { intent: "requirement_failure", knownEvidenceRevision: revision },
);
assert.equal(compactFailureCue?.reason, "error-location");
assert.equal(compactFailureCue?.targets[0]?.entityId, "service", "first failure survives compact unchanged evidence");
assert.equal(unfocusedFailureCue?.camera, "frame-primary");

const cacheCue = presentationCueForCapability(
  "inspect_cache",
  { componentId: "redis" },
  { ...context, architecture: { components: [{ id: "redis", deployments: [] }], connections: [] } },
);
assert.equal(cacheCue?.camera, "frame-primary");
assert.equal(cacheCue?.targets[0]?.entityId, "redis");

const connectionCue = presentationCueForCapability(
  "inspect_design_entity",
  { kind: "connection", entityId: "router-service", sourceComponentId: "router", targetComponentId: "service" },
  { ...context, architecture: { components: [{ id: "router", deployments: [] }, { id: "service", deployments: [] }], connections: [{ id: "router-service" }] } },
);
assert.equal(connectionCue?.camera, "frame-path");
assert.deepEqual(connectionCue?.targets.map((target) => target.entityId), ["router-service", "router", "service"]);

console.log("presentation cue verification passed");
