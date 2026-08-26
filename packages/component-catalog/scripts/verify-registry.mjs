import assert from "node:assert/strict";
import {
  ComponentDefinitionError,
  DuplicateComponentTypeError,
  UnknownComponentTypeError,
  componentRegistry,
  createComponentRegistry,
  postgresDefinition,
  postgresTierModels,
  redisDefinition,
  redisEffectiveModel,
  redisHitRateForConfig,
  redisMonthlyCostForConfig,
  redisTtlHitRateBands,
  globalRouterDefinition,
  loadBalancerDefinition,
  loadBalancerMonthlyCost,
  cdnConfiguredHitIntent,
  cdnDefinition,
  cdnHitRateForConfig,
  cdnMonthlyCostForConfig,
  cdnTierModels,
  cdnTtlHitRateBands,
  serviceCapacityPerInstance,
  serviceDefinition,
  serviceMonthlyCostPerInstance,
  trafficSourceDefinition,
} from "../dist/index.js";

const schema = {
  safeParse(input) {
    return input && typeof input === "object" && !Array.isArray(input)
      ? { success: true, data: input }
      : { success: false, errors: ["Expected an object."] };
  },
};

function definition(type, ports) {
  return {
    type,
    label: type,
    category: "infrastructure",
    defaultConfig: {},
    configSchema: schema,
    ports,
    metrics: [{ id: "load", label: "Load", unit: "rps" }],
    simulation: {},
    cost: {},
    regionSupport: false,
    replicationSupport: false,
    clusteringSupport: false,
    agentCapabilities: [],
    schemaVersion: 1,
  };
}

const registry = createComponentRegistry([
  definition("traffic-source", [{ id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] }]),
  definition("service", [
    { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
    { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] },
  ]),
  definition("postgres", [{ id: "database_in", label: "Database", direction: "input", connectionTypes: ["read_write"] }]),
]);

assert.equal(registry.get("service").type, "service");
assert.equal(registry.has("postgres"), true);
assert.equal(registry.list().length, 3);
assert.throws(() => registry.register(definition("service", [])), DuplicateComponentTypeError);
assert.throws(() => registry.get("missing"), UnknownComponentTypeError);
assert.throws(() => registry.register({ ...definition("broken", []), defaultConfig: [] }), ComponentDefinitionError);

assert.equal(componentRegistry.get("traffic-source"), trafficSourceDefinition);
assert.deepEqual(trafficSourceDefinition.defaultConfig, { label: "Incoming traffic" });
assert.deepEqual(trafficSourceDefinition.ports, [
  { id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] },
]);
assert.deepEqual(trafficSourceDefinition.metrics, [
  { id: "outgoing_requests_per_second", label: "Outgoing requests/sec", unit: "requests/sec" },
]);
assert.deepEqual(trafficSourceDefinition.simulation, { injectsChallengeWorkload: true });
assert.deepEqual(trafficSourceDefinition.cost, { fixedMonthlyCost: 0 });

assert.equal(componentRegistry.get("service"), serviceDefinition);
assert.deepEqual(serviceDefinition.defaultConfig, { size: "medium", instances: 1 });
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 1 }).success, true);
assert.deepEqual(serviceDefinition.configSchema.safeParse({ instances: 1 }).data, { size: "medium", instances: 1 });
assert.equal(serviceDefinition.configSchema.safeParse({ size: "small", instances: 2 }).success, true);
assert.equal(serviceDefinition.configSchema.safeParse({ size: "huge", instances: 1 }).success, false);
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 0 }).success, false);
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 11 }).success, false);
assert.equal(serviceDefinition.configSchema.safeParse({ instances: 1.5 }).success, false);
assert.deepEqual(serviceDefinition.ports, [
  { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
  { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] },
]);
assert.equal(serviceDefinition.simulation.sizeModels.medium.capacityPerInstance, serviceCapacityPerInstance);
assert.equal(serviceDefinition.simulation.baseP95LatencyMs, 20);
assert.equal(serviceDefinition.cost.sizeModels.medium.monthlyCostPerInstance, serviceMonthlyCostPerInstance);

assert.equal(componentRegistry.get("postgres"), postgresDefinition);
assert.deepEqual(postgresDefinition.defaultConfig, { tier: "small", readReplicaCount: 0 });
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "small" }).success, true);
assert.deepEqual(postgresDefinition.configSchema.safeParse({ tier: "small" }).data, { tier: "small", readReplicaCount: 0 });
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "medium", readReplicaCount: 2 }).success, true);
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "medium", readReplicaCount: 9 }).success, false);
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "large" }).success, true);
assert.equal(postgresDefinition.configSchema.safeParse({ tier: "extra-large" }).success, false);
assert.equal(postgresTierModels.small.readCapacityRps, 5_000);
assert.equal(postgresTierModels.small.writeCapacityRps, 800);
assert.equal(postgresTierModels.small.replicaReadCapacityRps, 5_000);
assert.equal(postgresTierModels.medium.readCapacityRps, 10_000);
assert.equal(postgresTierModels.medium.writeCapacityRps, 2_000);
assert.equal(postgresTierModels.large.monthlyCost, 7_000);
assert.notEqual(postgresTierModels.small.monthlyCost, postgresTierModels.medium.monthlyCost);
assert.equal(postgresDefinition.simulation.baseP95LatencyMs, 30);
assert.equal(postgresDefinition.simulation.writesTargetPrimaryOnly, true);
assert.equal(postgresDefinition.replicationSupport, true);
assert.deepEqual(postgresDefinition.ports, [
  { id: "database_in", label: "Database operations", direction: "input", connectionTypes: ["read_write"] },
]);

assert.equal(componentRegistry.get("redis"), redisDefinition);
assert.equal(componentRegistry.has("redis"), true);
assert.equal(componentRegistry.list().some((definition) => definition.type === "redis"), true);
assert.deepEqual(redisDefinition.defaultConfig, { mode: "standalone", tier: "medium", ttlBand: "medium" });
assert.equal(redisDefinition.configSchema.safeParse({ mode: "standalone", tier: "small", ttlBand: "short" }).success, true);
assert.equal(redisDefinition.configSchema.safeParse({ mode: "replicated", tier: "large", ttlBand: "long" }).success, true);
assert.equal(redisDefinition.configSchema.safeParse({ mode: "clustered", tier: "medium", ttlBand: "medium" }).success, false);
assert.equal(redisDefinition.clusteringSupport, false);
assert.equal(redisDefinition.replicationSupport, true);
assert.equal(redisDefinition.simulation.cacheCapable, true);
assert.equal(redisDefinition.simulation.absorbsWrites, false);
assert.deepEqual(redisDefinition.ports, [
  { id: "cache_in", label: "Cache operations", direction: "input", connectionTypes: ["read_write"] },
  { id: "origin_out", label: "Origin / miss", direction: "output", connectionTypes: ["read_write"] },
]);
assert.equal(redisHitRateForConfig({ ttlBand: "medium" }), redisTtlHitRateBands.medium);
assert.equal(redisMonthlyCostForConfig({ mode: "standalone", tier: "medium" }), 3_000);
assert.equal(redisMonthlyCostForConfig({ mode: "replicated", tier: "medium" }), 6_000);
assert.equal(redisEffectiveModel({ mode: "replicated", tier: "medium" }).hotKeyCapacityRps, 18_000);
assert.ok(redisDefinition.metrics.some((metric) => metric.id === "hit_rate"));
assert.ok(redisDefinition.metrics.some((metric) => metric.id === "hot_key_utilization"));

assert.equal(componentRegistry.get("global-router"), globalRouterDefinition);
assert.deepEqual(globalRouterDefinition.defaultConfig, {});
assert.equal(globalRouterDefinition.configSchema.safeParse({}).success, true);
assert.equal(globalRouterDefinition.configSchema.safeParse({ regionId: "us-east" }).success, false);
assert.equal(globalRouterDefinition.simulation.forwardsRequests, true);
assert.equal(globalRouterDefinition.simulation.geographicRouting, true);
assert.equal(globalRouterDefinition.simulation.routingPolicy, "nearest_healthy_region");
assert.equal(globalRouterDefinition.cost.fixedMonthlyCost, 0);
assert.deepEqual(globalRouterDefinition.ports, [
  { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
  { id: "route_out", label: "Route", direction: "output", connectionTypes: ["request"] },
]);
assert.ok(globalRouterDefinition.metrics.some((metric) => metric.id === "incoming_requests_per_second"));
assert.ok(globalRouterDefinition.metrics.some((metric) => metric.id === "forwarded_requests_per_second"));
assert.equal(globalRouterDefinition.metrics.some((metric) => metric.id.includes("regional")), false);

assert.equal(componentRegistry.get("load-balancer"), loadBalancerDefinition);
assert.deepEqual(loadBalancerDefinition.defaultConfig, { policy: "equal" });
assert.equal(loadBalancerDefinition.configSchema.safeParse({ policy: "equal" }).success, true);
assert.equal(loadBalancerDefinition.configSchema.safeParse({ policy: "capacity_weighted" }).success, true);
assert.equal(loadBalancerDefinition.configSchema.safeParse({ policy: "round_robin" }).success, false);
assert.equal(loadBalancerDefinition.simulation.forwardsRequests, true);
assert.equal(loadBalancerDefinition.simulation.failureAwareExclusion, false);
assert.equal(loadBalancerDefinition.cost.fixedMonthlyCost, loadBalancerMonthlyCost);
assert.ok(loadBalancerMonthlyCost > 0);
assert.deepEqual(loadBalancerDefinition.ports, [
  { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
  { id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] },
]);

assert.equal(componentRegistry.get("cdn"), cdnDefinition);
assert.deepEqual(cdnDefinition.defaultConfig, { coverage: 0.8, ttlBand: "medium", tier: "medium" });
assert.equal(cdnDefinition.configSchema.safeParse({ coverage: 0.5, ttlBand: "short", tier: "small" }).success, true);
assert.equal(cdnDefinition.configSchema.safeParse({ coverage: 1.5, ttlBand: "medium", tier: "medium" }).success, false);
assert.equal(cdnDefinition.configSchema.safeParse({ coverage: 0.8, ttlBand: "medium", tier: "xl" }).success, false);
assert.equal(cdnDefinition.simulation.cacheCapable, true);
assert.equal(cdnDefinition.simulation.reducesOriginRedirects, true);
assert.equal(cdnDefinition.simulation.absorbsWrites, false);
assert.equal(cdnDefinition.simulation.geographicRouting, false);
assert.equal(cdnDefinition.simulation.forwardsRequests, true);
assert.deepEqual(cdnDefinition.ports, [
  { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] },
  { id: "origin_out", label: "Origin", direction: "output", connectionTypes: ["request"] },
]);
assert.equal(cdnHitRateForConfig({ ttlBand: "medium" }), cdnTtlHitRateBands.medium);
assert.equal(cdnMonthlyCostForConfig({ tier: "medium" }), cdnTierModels.medium.monthlyCost);
assert.equal(cdnConfiguredHitIntent({ coverage: 0.8, ttlBand: "medium", tier: "medium" }), 0.8 * 0.75);
assert.ok(cdnDefinition.metrics.some((metric) => metric.id === "hit_rps"));
assert.ok(cdnDefinition.metrics.some((metric) => metric.id === "origin_rps"));

console.log("component registry verified");
