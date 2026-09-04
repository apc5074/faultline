import assert from "node:assert/strict";
import { inspectBottlenecks } from "../dist/capabilities/inspect-bottlenecks.js";

const context = {
  challenge: { slug: "x", version: 1, title: "x", prompt: "x", developmentOnly: true, workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [{ id: "latency", label: "latency", type: "latency", comparator: "lt", target: 100, unit: "ms" }], monthlyBudget: 100, allowedComponentTypes: [] },
  architecture: { version: 1, components: [], connections: [] },
  simulation: { available: true, components: { "service-b": { metrics: { utilization: 1.1 }, state: "critical" }, "service-a": { metrics: { effectiveUtilization: 0.9 }, capacity: [{ resource: "cpu", capacity: 10, load: 9, utilization: 0.9, headroom: 0.1 }] } }, system: { redirectP95Ms: 120, throughputPass: false }, scenarios: { hotKey: { active: true, passed: false } } },
  cost: { monthlyTotal: 101, lineItems: [] },
};
const result = inspectBottlenecks(context);
assert.equal(result.ok, true);
assert.deepEqual(result.data.risks.map((risk) => risk.kind), ["saturation", "headroom", "latency", "unmet_demand", "hot_key", "budget"]);
const unavailable = inspectBottlenecks({ ...context, simulation: { available: false, validationErrors: ["invalid"] } });
assert.deepEqual(unavailable, { ok: false, code: "SIMULATION_UNAVAILABLE", message: "invalid" });
console.log("inspect-bottlenecks helper verification passed");
