import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import {
  estimateMonthlyCost,
  evaluatePathLatency,
  evaluatePostgresCapacity,
  evaluateServiceCapacity,
  propagateTraffic,
} from "../dist/index.js";

const traffic = {
  id: "traffic-01",
  type: "traffic-source",
  config: { label: "Incoming traffic" },
  deployments: [],
  ui: { x: 0, y: 0 },
};

function service(id, instances, y = 0) {
  return { id, type: "service", config: { size: "medium", instances }, deployments: [], ui: { x: 400, y } };
}

function postgres(id = "postgres-01") {
  return { id, type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 650, y: 0 } };
}

function lb(id = "lb-01", policy = "capacity_weighted") {
  return { id, type: "load-balancer", config: { policy }, deployments: [], ui: { x: 180, y: 0 } };
}

function architecture(upstreams) {
  const components = [traffic, lb(), ...upstreams, postgres()];
  const connections = [
    {
      id: "traffic-lb",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "lb-01",
      targetPortId: "request_in",
      type: "request",
    },
    ...upstreams.flatMap((upstream, index) => [
      {
        id: `lb-${upstream.id}`,
        sourceComponentId: "lb-01",
        sourcePortId: "request_out",
        targetComponentId: upstream.id,
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: `svc-pg-${index}`,
        sourceComponentId: upstream.id,
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ]),
  ];
  return { version: 1, components, connections };
}

const challenge = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "load-balancer"],
};

// LB: one upstream ≈ equal split; two upstreams with capacity_weighted diverges from pure equal.
{
  const oneUpstream = architecture([service("service-a", 2)]);
  const twoUpstreams = architecture([service("service-a", 2, -40), service("service-b", 6, 40)]);

  const single = propagateTraffic({ architecture: oneUpstream, challenge, registry: componentRegistry });
  const dual = propagateTraffic({ architecture: twoUpstreams, challenge, registry: componentRegistry });
  assert.equal(single.valid, true);
  assert.equal(dual.valid, true);
  if (!single.valid || !dual.valid) throw new Error("invalid lb architecture");

  const singleA = single.traffic["service-a"].incomingRps;
  const dualA = dual.traffic["service-a"].incomingRps;
  const dualB = dual.traffic["service-b"].incomingRps;
  assert.ok(Math.abs(singleA - dualA - dualB) < 1e-6);
  assert.notEqual(dualA / dualB, 0.5);
}

// Off-path service receives no load.
{
  const offPath = {
    version: 1,
    components: [traffic, service("service-a", 4), service("service-b", 4), postgres()],
    connections: [
      {
        id: "traffic-service-a",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "service-a",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-a-postgres",
        sourceComponentId: "service-a",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
  const capacity = evaluateServiceCapacity({ architecture: offPath, challenge: tinyApiChallenge, registry: componentRegistry });
  assert.equal(capacity.valid, true);
  if (!capacity.valid) throw new Error("invalid off-path architecture");
  assert.equal(capacity.services["service-b"].incomingRps, 0);
  assert.equal(capacity.services["service-b"].placement?.participation ?? "idle", "idle");
}

// unitCostPressure on durable_store increases ACTIVE postgres cost; unreachable store stays base-only.
{
  const onPath = {
    version: 1,
    components: [traffic, service("service-a", 4), postgres()],
    connections: [
      {
        id: "traffic-service",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "service-a",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-postgres",
        sourceComponentId: "service-a",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
  const withOrphan = {
    ...onPath,
    components: [...onPath.components, postgres("postgres-orphan")],
  };

  const propagation = propagateTraffic({ architecture: onPath, challenge: tinyApiChallenge, registry: componentRegistry });
  assert.equal(propagation.valid, true);
  if (!propagation.valid) throw new Error("invalid store architecture");

  const neutral = estimateMonthlyCost({
    architecture: onPath,
    registry: componentRegistry,
    traffic: propagation.traffic,
    challenge: tinyApiChallenge,
  });
  const pressured = estimateMonthlyCost({
    architecture: onPath,
    registry: componentRegistry,
    traffic: propagation.traffic,
    challenge: {
      ...tinyApiChallenge,
      workloadAffinity: { mechanisms: { durable_store: { maxEffectiveness: 1, unitCostPressure: 2.5 } } },
    },
  });
  const primaryLine = (result) => result.lineItems.find((item) => item.componentId === "postgres-01")?.amount ?? 0;
  assert.ok(primaryLine(pressured) > primaryLine(neutral));

  const orphanNeutral = estimateMonthlyCost({
    architecture: withOrphan,
    registry: componentRegistry,
    traffic: propagation.traffic,
    challenge: {
      ...tinyApiChallenge,
      workloadAffinity: { mechanisms: { durable_store: { maxEffectiveness: 1, unitCostPressure: 2.5 } } },
    },
  });
  const orphanLine = orphanNeutral.lineItems.find((item) => item.componentId === "postgres-orphan")?.amount ?? 0;
  const activeOnlyLine = primaryLine(orphanNeutral);
  assert.equal(orphanLine, primaryLine(neutral));
  assert.ok(activeOnlyLine > orphanLine);
}

// processingLatencyPenaltyMs increases p95 when postgres is ACTIVE on-path.
{
  const onPath = {
    version: 1,
    components: [traffic, service("service-a", 4), postgres()],
    connections: [
      {
        id: "traffic-service",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "service-a",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-postgres",
        sourceComponentId: "service-a",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
  const base = evaluatePathLatency({ architecture: onPath, challenge: tinyApiChallenge, registry: componentRegistry });
  const penalized = evaluatePathLatency({
    architecture: onPath,
    challenge: {
      ...tinyApiChallenge,
      workloadAffinity: { mechanisms: { durable_store: { maxEffectiveness: 1, processingLatencyPenaltyMs: 40 } } },
    },
    registry: componentRegistry,
  });
  assert.equal(base.valid, true);
  assert.equal(penalized.valid, true);
  if (!base.valid || !penalized.valid) throw new Error("invalid latency architecture");
  assert.ok(penalized.p95LatencyMs > base.p95LatencyMs);
  assert.ok(penalized.postgres["postgres-01"].placement?.processingLatencyPenaltyMs === 40);
}

// Postgres capacity scales down when mechanism effectiveness is reduced (simulates wrong-store pressure on throughput).
{
  const onPath = {
    version: 1,
    components: [traffic, service("service-a", 4), postgres()],
    connections: [
      {
        id: "traffic-service",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "service-a",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-postgres",
        sourceComponentId: "service-a",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
  const full = evaluatePostgresCapacity({ architecture: onPath, challenge: tinyApiChallenge, registry: componentRegistry });
  const weak = evaluatePostgresCapacity({
    architecture: onPath,
    challenge: {
      ...tinyApiChallenge,
      workloadAffinity: { mechanisms: { durable_store: { maxEffectiveness: 0.5 } } },
    },
    registry: componentRegistry,
  });
  assert.equal(full.valid, true);
  assert.equal(weak.valid, true);
  if (!full.valid || !weak.valid) throw new Error("invalid postgres capacity architecture");
  assert.ok(weak.postgres["postgres-01"].effectiveUtilization > full.postgres["postgres-01"].effectiveUtilization);
}

console.log("workload affinity non-cache mechanisms verified");
