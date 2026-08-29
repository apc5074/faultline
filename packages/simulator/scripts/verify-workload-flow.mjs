import assert from "node:assert/strict";
import { aggregateWorkloadPathFlows, assertWorkloadPathFlow } from "../dist/index.js";

const complete = {
  channelId: "redirect",
  pathId: "service-a-origin",
  componentIds: ["traffic", "lb", "service-a", "postgres"],
  offeredRps: 50,
  acceptedRps: 50,
  completedRps: 50,
  failedRps: 0,
  unresolvedRps: 0,
  terminalRole: "primary_store",
  status: "complete",
};
const failed = {
  channelId: "redirect",
  pathId: "service-b-dead-end",
  componentIds: ["traffic", "lb", "service-b"],
  offeredRps: 50,
  acceptedRps: 50,
  completedRps: 0,
  failedRps: 50,
  unresolvedRps: 0,
  status: "failed",
  failureCode: "missing_required_dependency",
  failureReason: "Service has no reachable redirect data path.",
};

assert.doesNotThrow(() => assertWorkloadPathFlow(complete));
const summary = aggregateWorkloadPathFlows("redirect", 100, [failed, complete]);
assert.equal(summary.completedRps, 50);
assert.equal(summary.failedRps, 50);
assert.equal(summary.completionRatio, 0.5);
assert.deepEqual(summary.paths.map((path) => path.pathId), ["service-a-origin", "service-b-dead-end"]);

assert.throws(
  () => aggregateWorkloadPathFlows("redirect", 100, [complete]),
  /do not account for all demand/,
);
assert.throws(
  () => aggregateWorkloadPathFlows("redirect", 100, [{ ...complete, completedRps: 40, failedRps: 0 }]),
  /does not conserve offered traffic/,
);

const cacheBranches = aggregateWorkloadPathFlows("redirect", 100, [
  { ...complete, pathId: "cache-hit", componentIds: ["traffic", "cdn"], offeredRps: 80, acceptedRps: 80, completedRps: 80, terminalRole: "edge_ingress" },
  { ...complete, pathId: "cache-miss", componentIds: ["traffic", "service", "postgres"], offeredRps: 20, acceptedRps: 20, completedRps: 20 },
]);
assert.equal(cacheBranches.completedRps, 100);
assert.equal(cacheBranches.failureRatio, 0);

console.log("simulator workload flow contracts verified");
