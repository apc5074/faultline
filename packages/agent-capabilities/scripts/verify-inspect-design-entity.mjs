import assert from "node:assert/strict";

import { urlShortenerChallenge } from "../../challenges/dist/index.js";
import {
  createDefaultCapabilityRegistry,
  createScopedEntityReference,
  inspectDesignEntity,
  inspectDesignEntityCapability,
  inspectDesignEntityInputSchema,
  resolveInspectDesignEntityTarget,
} from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: { instances: 2, label: "API Service" }, deployments: [{ id: "svc-east", regionId: "us-east", config: { instances: 2 } }], ui: { x: 0, y: 0 } },
    { id: "service-2", type: "service", config: { instances: 1 }, deployments: [], ui: { x: 2, y: 0 } },
    { id: "postgres-1", type: "postgres", config: { tier: "large" }, deployments: [{ id: "pg-east", regionId: "us-east", config: { role: "primary" } }], ui: { x: 1, y: 0 } },
  ],
  connections: [
    { id: "svc-pg", sourceComponentId: "service-1", sourcePortId: "db", targetComponentId: "postgres-1", targetPortId: "db", type: "read_write" },
  ],
};

const context = {
  challenge: urlShortenerChallenge,
  architecture,
  simulation: {
    available: true,
    components: {
      "service-1": { metrics: { incomingRps: 4000, utilization: 0.8, p95Ms: 120 } },
      "postgres-1": { metrics: { readUtilization: 0.6, writeUtilization: 0.4 } },
    },
    system: { redirectP95Ms: 120, throughputPass: false, minimumHeadroom: 0.1 },
    workloadPaths: {
      redirects: {
        channelId: "redirects",
        paths: [{ pathId: "redirect-path", componentIds: ["service-1", "postgres-1"], connectionIds: ["svc-pg"], status: "partial", failureCode: "capacity", failureReason: "Postgres write pressure" }],
        inactiveComponentIds: [],
      },
    },
    regional: {
      active: true,
      origins: [{ regionId: "us-east", redirectRps: 100000, writeRps: 10000 }],
      routes: [{ originRegion: "us-east", destinationRegion: "us-east", componentId: "service-1", deploymentId: "svc-east", kind: "request", rps: 100000, networkLatencyMs: 2 }],
    },
  },
  cost: { monthlyTotal: 12000, lineItems: [{ componentId: "service-1", amount: 8000 }, { componentId: "postgres-1", amount: 4000 }] },
  requirementResults: [{ id: "latency", type: "latency", passed: false, actual: 120, target: 50, operator: "lte", explanation: "service-1 latency exceeds target" }],
  evidenceMeta: { architectureRevision: "entity-fixture", simulationRunId: "live-entity", simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
};

assert.equal(inspectDesignEntityInputSchema.safeParse({ kind: "component", ref: "service-1" }).success, false);

const connection = inspectDesignEntity(context, { kind: "connection", ref: "svc-pg" });
assert.equal(connection.ok, true);
if (connection.ok) {
  assert.equal(connection.data.carriedWorkloadChannelIds[0], "redirects");
  assert.equal(connection.data.paths[0].status, "partial");
  assert.ok(connection.data.endpointMetrics.length === 2);
}

const cdnLbContext = {
  ...context,
  architecture: {
    ...architecture,
    components: [
      ...architecture.components,
      { id: "cdn-1", type: "cdn", config: {}, deployments: [], ui: { x: -2, y: 0 } },
      { id: "lb-1", type: "load-balancer", config: {}, deployments: [], ui: { x: -1, y: 0 } },
    ],
    connections: [
      ...architecture.connections,
      { id: "cdn-lb", sourceComponentId: "cdn-1", sourcePortId: "out", targetComponentId: "lb-1", targetPortId: "in", type: "request" },
    ],
  },
};
const structuredConnection = inspectDesignEntity(cdnLbContext, {
  kind: "connection",
  endpoints: { source: { componentId: "cdn-1" }, target: { componentId: "lb-1" } },
});
assert.equal(structuredConnection.ok, true);
if (structuredConnection.ok) assert.equal(structuredConnection.data.entityId, "cdn-lb");

const ambiguousConnection = inspectDesignEntity({
  ...cdnLbContext,
  architecture: {
    ...cdnLbContext.architecture,
    connections: [
      ...cdnLbContext.architecture.connections,
      { id: "cdn-lb-duplicate", sourceComponentId: "cdn-1", sourcePortId: "out", targetComponentId: "lb-1", targetPortId: "in", type: "request" },
    ],
  },
}, {
  kind: "connection",
  endpoints: { source: { type: "cdn", scope: "all" }, target: { type: "load-balancer", scope: "all" } },
});
assert.equal(ambiguousConnection.ok, false);
if (!ambiguousConnection.ok) {
  assert.equal(ambiguousConnection.code, "INVALID_INPUT");
  assert.equal(ambiguousConnection.recovery?.choices?.length, 2);
  assert.ok(ambiguousConnection.recovery?.choices?.every((choice) => choice.startsWith("wmp-ent-")));
}

const requirement = inspectDesignEntity(context, { kind: "requirement", ref: "latency" });
assert.equal(requirement.ok, true);
if (requirement.ok) assert.equal(requirement.data.status, "failed");

const deferred = inspectDesignEntity(
  { ...context, requirementResults: [], simulation: { available: true, components: context.simulation.components, system: context.simulation.system, workloadPaths: context.simulation.workloadPaths } },
  { kind: "requirement", ref: "availability" },
);
assert.equal(deferred.ok, true);
if (deferred.ok) assert.equal(deferred.data.status, "deferred");

const workload = inspectDesignEntity(context, { kind: "workload", ref: "redirects" });
assert.equal(workload.ok, true);
if (workload.ok) assert.equal(workload.data.constrainedHop?.pathId, "redirect-path");

const region = inspectDesignEntity(context, { kind: "region", ref: "us-east" });
assert.equal(region.ok, true);
if (region.ok) {
  assert.equal(region.data.deployments.length, 2);
  assert.equal(region.data.originShare?.redirectRps, 100000);
}
const namedWorkload = inspectDesignEntity(context, { kind: "workload", selector: { scope: "named", channelId: "redirects" } });
assert.equal(namedWorkload.ok, true);
if (namedWorkload.ok) assert.deepEqual(namedWorkload.data.channel.paths[0].connectionIds, ["svc-pg"]);
const defaultWorkload = inspectDesignEntity({
  ...context,
  simulation: {
    ...context.simulation,
    workloadPaths: {
      ...context.simulation.workloadPaths,
      "z-failing": { channelId: "z-failing", paths: [{ pathId: "z-path", componentIds: ["service-1"], connectionIds: [], status: "failed" }] },
      "a-failing": { channelId: "a-failing", paths: [{ pathId: "a-path", componentIds: ["service-1"], connectionIds: [], status: "failed" }] },
    },
  },
}, { kind: "workload", selector: { scope: "default" } });
assert.equal(defaultWorkload.ok, true);
if (defaultWorkload.ok) assert.equal(defaultWorkload.data.entityId, "a-failing");

const ambiguous = resolveInspectDesignEntityTarget("component", "service", context);
assert.equal(ambiguous.ok, false);
if (!ambiguous.ok) assert.ok(ambiguous.choices && ambiguous.choices.length > 1);

assert.equal(inspectDesignEntityCapability.annotations.readOnlyHint, true);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("inspect_design_entity"));
const invoked = await registry.invoke("inspect_design_entity", context, { kind: "connection", ref: "svc-pg" });
assert.equal(invoked.ok, true);

console.log("verify-inspect-design-entity: ok");
