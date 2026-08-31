import assert from "node:assert/strict";

import {
  inspectComponent,
  inspectComponentInputSchema,
  inspectDesignEntity,
  presentationCueForCapability,
  validatePresentationCue,
} from "../dist/index.js";

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
      { id: "postgres-b", type: "postgres", config: {}, deployments: [], ui: { x: 4, y: 2 } },
      { id: "postgres-a", type: "postgres", config: {}, deployments: [], ui: { x: 1, y: 2 } },
      { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    ],
    connections: [],
  },
  simulation: { available: false },
};

assert.equal(inspectComponentInputSchema.safeParse({ selector: { type: "DB", scope: "all" } }).success, false);
const before = JSON.stringify(context.architecture);
const all = inspectComponent(context, { selector: { type: "postgres", scope: "all" } });
assert.equal(all.ok, true);
if (all.ok) assert.deepEqual(all.data.selection.resolvedComponentIds, ["postgres-a", "postgres-b"]);
assert.equal(JSON.stringify(context.architecture), before);

const relationship = inspectDesignEntity(context, {
  kind: "connection",
  endpoints: { source: { componentId: "postgres-a" }, target: { componentId: "postgres-b" } },
});
assert.equal(relationship.ok, false);
if (!relationship.ok) assert.equal(relationship.code, "NOT_FOUND");
assert.equal(JSON.stringify(context.architecture), before);

const setCue = presentationCueForCapability(
  "inspect_component",
  { selection: { type: "postgres", scope: "all", matchedCount: 2, resolvedComponentIds: ["postgres-a", "postgres-b"] }, components: [] },
  context,
);
assert.equal(setCue?.kind, "set");
assert.equal(setCue?.camera, "frame-set");
assert.deepEqual(setCue?.targets.map((target) => target.entityId), ["postgres-a", "postgres-b"]);
assert.equal(setCue?.targets.some((target) => target.kind === "connection"), false);
assert.ok(setCue && validatePresentationCue(setCue, "unversioned"));

const unrelatedPath = presentationCueForCapability(
  "inspect_design_entity",
  { kind: "workload", entityId: "workload-1", channel: { paths: [{ componentIds: ["postgres-a", "postgres-b"], connectionIds: [], status: "complete" }] } },
  context,
);
assert.equal(unrelatedPath, undefined);

console.log("verify-tool-router-guardrails: ok");
