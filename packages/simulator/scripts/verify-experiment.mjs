import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge, urlShortenerChallenge } from "@faultline/challenges";
import { evaluateExperiment, evaluateRequirements, SIMULATOR_VERSION } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};

const input = {
  architecture,
  challenge: tinyApiChallenge,
  registry: componentRegistry,
};

const baseline = evaluateRequirements(input);
assert.equal(baseline.valid, true);
if (!baseline.valid) throw new Error("Expected valid baseline.");

const experiment = evaluateExperiment({
  ...input,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 5 } },
});
assert.equal(experiment.ok, true);
if (!experiment.ok) throw new Error("Expected successful experiment.");
assert.equal(experiment.data.simulated, true);
assert.equal(experiment.data.simulatorVersion, SIMULATOR_VERSION);
assert.equal(experiment.data.type, "traffic_multiplier");
assert.equal(experiment.data.baseline.allRequirementsPass, baseline.allRequirementsPass);
assert.equal(experiment.data.baseline.p95LatencyMs, baseline.p95LatencyMs);
assert.equal(experiment.data.baseline.throughputRatio, baseline.throughputRatio);
assert.equal(experiment.data.baseline.cost.monthlyTotal, baseline.cost.monthlyTotal);
assert.ok(experiment.data.events.length > 0);
assert.equal(experiment.data.events[0]?.type, "experiment_started");
assert.equal(experiment.data.events[1]?.type, "traffic_multiplier_applied");
assert.equal(experiment.data.events.at(-1)?.type, "experiment_completed");
assert.equal(experiment.data.events[1]?.data.multiplier, 5);
const simulationStarted = experiment.data.events.find((event) => event.type === "simulation_started");
assert.equal(simulationStarted?.data.requestsPerSecond, tinyApiChallenge.workload.requestsPerSecond * 5);
const databaseRoute = experiment.data.events.find(
  (event) => event.type === "traffic_routed" && event.connectionId === "service-postgres",
);
assert.ok(databaseRoute);
assert.equal(
  databaseRoute.data.readRequestsPerSecond / databaseRoute.data.writeRequestsPerSecond,
  tinyApiChallenge.workload.readRatio / tinyApiChallenge.workload.writeRatio,
);
assert.ok(experiment.data.outcome.throughputRatio < experiment.data.baseline.throughputRatio);
assert.ok(experiment.data.outcome.headroom < experiment.data.baseline.headroom);
assert.ok(experiment.data.delta.metrics.throughputRatio < 0);
assert.ok(experiment.data.delta.metrics.headroom < 0);
assert.deepEqual(architecture, input.architecture);
assert.equal(tinyApiChallenge.workload.requestsPerSecond, input.challenge.workload.requestsPerSecond);

for (const multiplier of [1.25, 1.5, 2, 3, 5]) {
  const candidate = evaluateExperiment({
    ...input,
    experiment: { type: "traffic_multiplier", parameters: { multiplier } },
  });
  assert.equal(candidate.ok, true, `multiplier ${multiplier} should evaluate`);
}

const hotKeyExperiment = evaluateExperiment({
  ...input,
  experiment: { type: "hot_key", parameters: { hotKeyReadFraction: 0.25 } },
});
assert.equal(hotKeyExperiment.ok, true);
if (!hotKeyExperiment.ok) throw new Error("Expected hot-key experiment.");
assert.equal(hotKeyExperiment.data.baseline.hotKey.active, false);
assert.equal(hotKeyExperiment.data.outcome.hotKey.active, true);
assert.equal(
  hotKeyExperiment.data.outcome.hotKey.viralRedirectRps,
  tinyApiChallenge.workload.requestsPerSecond * tinyApiChallenge.workload.readRatio * 0.25,
);
assert.equal(
  hotKeyExperiment.data.events.find((event) => event.type === "hot_key_pattern_applied")?.data.hotKeyReadFraction,
  0.25,
);
assert.deepEqual(architecture, input.architecture);
assert.equal(tinyApiChallenge.workload.hotKeyReadFraction, undefined);

const baselineHotKeyChallenge = {
  ...tinyApiChallenge,
  workload: { ...tinyApiChallenge.workload, hotKeyReadFraction: 0.25 },
};
const unchangedHotKey = evaluateExperiment({
  ...input,
  challenge: baselineHotKeyChallenge,
  experiment: { type: "hot_key", parameters: { hotKeyReadFraction: 0.25 } },
});
assert.equal(unchangedHotKey.ok, false);
if (!unchangedHotKey.ok) assert.equal(unchangedHotKey.code, "INVALID_INPUT");

const cachedArchitecture = {
  version: 1,
  components: [
    architecture.components[0],
    architecture.components[1],
    { id: "redis-01", type: "redis", config: { mode: "standalone", tier: "medium", ttlBand: "medium" }, deployments: [], ui: { x: 2, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 3, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-redis", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "redis-01", targetPortId: "cache_in", type: "read_write" },
    { id: "redis-postgres", sourceComponentId: "redis-01", sourcePortId: "origin_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};
const cacheChallenge = { ...tinyApiChallenge, allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "redis"] };
const cachedBaseline = evaluateRequirements({ architecture: cachedArchitecture, challenge: cacheChallenge, registry: componentRegistry });
assert.equal(cachedBaseline.valid, true);
if (!cachedBaseline.valid) throw new Error("Expected cached baseline.");
assert.ok(cachedBaseline.caches["redis-01"].hitRps > 0);

const cacheFlush = evaluateExperiment({
  architecture: cachedArchitecture,
  challenge: cacheChallenge,
  registry: componentRegistry,
  experiment: { type: "cache_flush", parameters: { componentId: "redis-01" } },
});
assert.equal(cacheFlush.ok, true);
if (!cacheFlush.ok) throw new Error("Expected cache flush experiment.");
assert.equal(cacheFlush.data.events[1]?.type, "cache_flushed");
assert.equal(cacheFlush.data.events[1]?.componentId, "redis-01");
const coldRedis = cacheFlush.data.events.find(
  (event) => event.type === "component_load_changed" && event.componentId === "redis-01",
);
assert.equal(coldRedis?.data.hitRate, 0);
assert.equal(coldRedis?.data.hitRps, 0);
assert.deepEqual(cachedBaseline.caches["redis-01"].hitRps > 0, true);

const invalidCacheFlush = evaluateExperiment({
  architecture: cachedArchitecture,
  challenge: cacheChallenge,
  registry: componentRegistry,
  experiment: { type: "cache_flush", parameters: { componentId: "service-01" } },
});
assert.equal(invalidCacheFlush.ok, false);
if (!invalidCacheFlush.ok) assert.equal(invalidCacheFlush.code, "UNSUPPORTED_TARGET");

const serviceFailure = evaluateExperiment({
  ...input,
  experiment: { type: "component_failure", parameters: { componentId: "service-01" } },
});
assert.equal(serviceFailure.ok, true);
if (!serviceFailure.ok) throw new Error("Expected service failure experiment.");
assert.equal(serviceFailure.data.events[1]?.type, "component_failed");
assert.ok(serviceFailure.data.events.some((event) => event.type === "unroutable_demand"));
assert.equal(serviceFailure.data.outcome.throughputRatio, 0);
assert.equal(serviceFailure.data.outcome.allRequirementsPass, false);
assert.deepEqual(architecture, input.architecture);

const invalidServiceFailure = evaluateExperiment({
  ...input,
  experiment: { type: "component_failure", parameters: { componentId: "postgres-01" } },
});
assert.equal(invalidServiceFailure.ok, false);
if (!invalidServiceFailure.ok) assert.equal(invalidServiceFailure.code, "UNSUPPORTED_TARGET");

const loadBalancedArchitecture = {
  version: 1,
  components: [
    architecture.components[0],
    { id: "lb-01", type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: { x: 120, y: 0 } },
    { id: "service-a", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 300, y: -60 } },
    { id: "service-b", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 300, y: 60 } },
  ],
  connections: [
    { id: "traffic-lb", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "lb-01", targetPortId: "request_in", type: "request" },
    { id: "lb-a", sourceComponentId: "lb-01", sourcePortId: "request_out", targetComponentId: "service-a", targetPortId: "request_in", type: "request" },
    { id: "lb-b", sourceComponentId: "lb-01", sourcePortId: "request_out", targetComponentId: "service-b", targetPortId: "request_in", type: "request" },
  ],
};
const loadBalancedChallenge = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "load-balancer"],
};
const redistributedFailure = evaluateExperiment({
  architecture: loadBalancedArchitecture,
  challenge: loadBalancedChallenge,
  registry: componentRegistry,
  experiment: { type: "component_failure", parameters: { componentId: "service-a" } },
});
assert.equal(redistributedFailure.ok, true);
if (!redistributedFailure.ok) throw new Error("Expected redistributed service failure experiment.");
assert.equal(
  redistributedFailure.data.events.some((event) => event.type === "traffic_routed" && event.componentId === "service-a"),
  false,
);
const healthyServiceTraffic = redistributedFailure.data.events.find(
  (event) => event.type === "traffic_routed" && event.componentId === "service-b" && event.data.kind === "request",
);
assert.equal(healthyServiceTraffic?.data.requestsPerSecond, tinyApiChallenge.workload.requestsPerSecond);

const firstRun = JSON.stringify(experiment.data);
const secondRun = JSON.stringify(
  evaluateExperiment({
    ...input,
    experiment: { type: "traffic_multiplier", parameters: { multiplier: 5 } },
  }).data,
);
assert.equal(firstRun, secondRun);

const invalidBaseline = evaluateExperiment({
  architecture: { version: 1, components: [], connections: [] },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
});
assert.equal(invalidBaseline.ok, false);
if (invalidBaseline.ok) throw new Error("Expected invalid baseline error.");
assert.equal(invalidBaseline.code, "INVALID_BASELINE");

const invalidExperiment = evaluateExperiment({
  ...input,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 1 } },
});
assert.equal(invalidExperiment.ok, false);
if (invalidExperiment.ok) throw new Error("Expected invalid experiment.");
assert.equal(invalidExperiment.code, "INVALID_INPUT");

const regionalArchitecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "router-01", type: "global-router", config: {}, deployments: [], ui: { x: 120, y: 0 } },
    {
      id: "service-01", type: "service", config: { size: "medium", instances: 8 },
      deployments: [
        { id: "service-us", regionId: "us-east", config: { instances: 4 } },
        { id: "service-eu", regionId: "europe", config: { instances: 4 } },
      ], ui: { x: 300, y: 0 },
    },
    {
      id: "postgres-01", type: "postgres", config: { tier: "large", readReplicaCount: 1 },
      deployments: [
        { id: "postgres-us", regionId: "us-east", config: { role: "primary" } },
        { id: "postgres-eu", regionId: "europe", config: { role: "replica" } },
      ], ui: { x: 540, y: 0 },
    },
  ],
  connections: [
    { id: "t-r", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "router-01", targetPortId: "request_in", type: "request" },
    { id: "r-s", sourceComponentId: "router-01", sourcePortId: "route_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "s-p", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};
const regionalMultiplier = evaluateExperiment({
  architecture: regionalArchitecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
});
assert.equal(regionalMultiplier.ok, true);
if (!regionalMultiplier.ok) throw new Error("Expected regional multiplier experiment.");
assert.equal(regionalMultiplier.data.parameters.multiplier, 2);
const regionalStarted = regionalMultiplier.data.events.find((event) => event.type === "simulation_started");
assert.equal(regionalStarted?.data.requestsPerSecond, urlShortenerChallenge.workload.requestsPerSecond * 2);
const regionalRoutes = regionalMultiplier.data.events.filter(
  (event) =>
    event.type === "traffic_routed" &&
    event.componentId === "service-01" &&
    event.data.originRegion !== undefined,
);
assert.ok(regionalRoutes.length > 0);
const regionalRouteByOrigin = new Map(
  regionalRoutes.map((event) => [event.data.originRegion, Number(event.data.requestsPerSecond ?? 0)]),
);
assert.equal(
  [...regionalRouteByOrigin.values()].reduce((sum, rps) => sum + rps, 0),
  urlShortenerChallenge.workload.requestsPerSecond * 2,
);
const regionalFailure = evaluateExperiment({
  architecture: regionalArchitecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
  experiment: { type: "region_failure", parameters: { regionId: "us-east" } },
});
assert.equal(regionalFailure.ok, true);
if (!regionalFailure.ok) throw new Error("Expected regional failure experiment.");
assert.ok(regionalFailure.data.events.some((event) => event.type === "region_failed"));
assert.ok(regionalFailure.data.events.some((event) => event.type === "traffic_rerouted"));
assert.ok(regionalFailure.data.events.some((event) => event.type === "database_unavailable"));
assert.ok(regionalFailure.data.events.some((event) => event.type === "unroutable_demand"));
assert.ok(regionalFailure.data.outcome.throughputRatio < regionalFailure.data.baseline.throughputRatio);
assert.equal(regionalFailure.data.baseline.valid, true);
assert.ok(
  !regionalFailure.data.events.some(
    (event) =>
      event.type === "traffic_routed" &&
      event.data.destinationRegion === "us-east" &&
      event.data.kind === "request",
  ),
);
assert.deepEqual(regionalArchitecture.components[2].deployments.map((deployment) => deployment.regionId), ["us-east", "europe"]);

console.log("experiment evaluation verified");
