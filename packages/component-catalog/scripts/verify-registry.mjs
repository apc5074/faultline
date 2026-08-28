import assert from "node:assert/strict";
import { checkConnectionCompatibility } from "@faultline/core";
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
  objectStorageDefinition,
  objectStorageTiers,
  objectStorageTierModels,
  objectStorageMonthlyBaseCostForConfig,
  queueDefinition,
  queueCapacityTiers,
  queueCapacityModels,
  queueCapacityWorkUnitsForConfig,
  queueMonthlyCostForConfig,
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
    presentation: {
      glyph: "server",
      size: "standard",
      visualConfig: [],
      supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
    },
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
assert.throws(() => registry.register({ ...definition("missing-presentation", []), presentation: undefined }), ComponentDefinitionError);
assert.throws(
  () => registry.register({ ...definition("bad-glyph", []), presentation: { ...definition("x", []).presentation, glyph: "Server" } }),
  ComponentDefinitionError,
);
assert.throws(
  () => registry.register({ ...definition("bad-size", []), presentation: { ...definition("x", []).presentation, size: "huge" } }),
  ComponentDefinitionError,
);
assert.throws(
  () => registry.register({
    ...definition("bad-state", []),
    presentation: { ...definition("x", []).presentation, supportedStates: ["idle", "busy"] },
  }),
  ComponentDefinitionError,
);
assert.throws(
  () => registry.register({
    ...definition("duplicate-binding", []),
    presentation: {
      ...definition("x", []).presentation,
      visualConfig: [
        { name: "tier", source: "config", path: "tier" },
        { name: "tier", source: "config", path: "mode" },
      ],
    },
  }),
  ComponentDefinitionError,
);
assert.throws(
  () => registry.register({
    ...definition("non-serializable-presentation", []),
    presentation: { ...definition("x", []).presentation, unsupported: () => "not JSON" },
  }),
  ComponentDefinitionError,
);

for (const registeredDefinition of componentRegistry.list()) {
  assert.ok(registeredDefinition.presentation, `${registeredDefinition.type} has a presentation descriptor`);
  assert.ok(registeredDefinition.presentation.glyph.length > 0);
  assert.ok(registeredDefinition.presentation.supportedStates.includes("idle"));
  assert.equal(registeredDefinition.configSchema.safeParse(registeredDefinition.defaultConfig).success, true);
  assert.equal(new Set(registeredDefinition.metrics.map((metric) => metric.id)).size, registeredDefinition.metrics.length);

  for (const binding of registeredDefinition.presentation.visualConfig) {
    assert.ok(binding.name.length > 0, `${registeredDefinition.type} visual binding has a name`);
    assert.ok(binding.path.length > 0, `${registeredDefinition.type} visual binding has a path`);
    if (binding.source === "config") {
      const resolved = binding.path.split(".").reduce((value, segment) => value?.[segment], registeredDefinition.defaultConfig);
      assert.notEqual(resolved, undefined, `${registeredDefinition.type} binding ${binding.name} resolves from default config`);
    }
  }
}

const definitionByType = Object.fromEntries(componentRegistry.list().map((definition) => [definition.type, definition]));
const port = (type, id) => {
  const value = definitionByType[type].ports.find((candidate) => candidate.id === id);
  assert.ok(value, `${type}.${id} must exist`);
  return value;
};
const assertCompatible = (sourceType, sourcePortId, targetType, targetPortId, connectionType) => {
  assert.equal(
    checkConnectionCompatibility(
      port(sourceType, sourcePortId),
      port(targetType, targetPortId),
      connectionType,
    ).valid,
    true,
    `${sourceType}.${sourcePortId} → ${targetType}.${targetPortId} must support ${connectionType}`,
  );
};
const assertIncompatible = (sourceType, sourcePortId, targetType, targetPortId, connectionType) => {
  assert.equal(
    checkConnectionCompatibility(
      port(sourceType, sourcePortId),
      port(targetType, targetPortId),
      connectionType,
    ).valid,
    false,
    `${sourceType}.${sourcePortId} → ${targetType}.${targetPortId} must reject ${connectionType}`,
  );
};

assert.deepEqual(Object.keys(definitionByType).sort(), [
  "cdn",
  "global-router",
  "load-balancer",
  "object-storage",
  "postgres",
  "queue",
  "redis",
  "service",
  "traffic-source",
]);

// The Level 1 graph vocabulary has one legal request chain and one legal
// store chain. Keeping this here prevents inspector/rail changes from exposing
// a configuration that cannot be represented by the catalog's typed ports.
assertCompatible("traffic-source", "request_out", "cdn", "request_in", "request");
assertCompatible("traffic-source", "request_out", "global-router", "request_in", "request");
assertCompatible("traffic-source", "request_out", "load-balancer", "request_in", "request");
assertCompatible("traffic-source", "request_out", "service", "request_in", "request");
assertCompatible("cdn", "origin_out", "global-router", "request_in", "request");
assertCompatible("cdn", "origin_out", "load-balancer", "request_in", "request");
assertCompatible("cdn", "origin_out", "service", "request_in", "request");
assertCompatible("service", "object_out", "object-storage", "object_in", "object_io");
assertCompatible("object-storage", "object_out", "service", "object_in", "object_io");
assertCompatible("service", "async_out", "queue", "queue_in", "async_work");
assertIncompatible("object-storage", "object_out", "postgres", "database_in", "read_write");
assertCompatible("global-router", "route_out", "load-balancer", "request_in", "request");
assertCompatible("global-router", "route_out", "service", "request_in", "request");
assertCompatible("load-balancer", "request_out", "service", "request_in", "request");
assertCompatible("service", "database_out", "redis", "cache_in", "read_write");
assertCompatible("service", "database_out", "postgres", "database_in", "read_write");
assertCompatible("redis", "origin_out", "postgres", "database_in", "read_write");
assertIncompatible("traffic-source", "request_out", "postgres", "database_in", "request");
assertIncompatible("service", "database_out", "postgres", "database_in", "request");
assertIncompatible("cdn", "origin_out", "redis", "cache_in", "request");

assert.equal(componentRegistry.get("object-storage"), objectStorageDefinition);
assert.deepEqual(objectStorageTiers, ["standard", "high-throughput"]);
assert.deepEqual(objectStorageDefinition.defaultConfig, { tier: "standard" });
assert.equal(objectStorageDefinition.configSchema.safeParse({}).success, true);
assert.deepEqual(objectStorageDefinition.configSchema.safeParse({}).data, { tier: "standard" });
assert.equal(objectStorageDefinition.configSchema.safeParse({ tier: "high-throughput" }).success, true);
assert.equal(objectStorageDefinition.configSchema.safeParse({ tier: "archive" }).success, false);
assert.equal(objectStorageTierModels.standard.uploadCapacityBytesPerSecond > 0, true);
assert.equal(objectStorageTierModels.standard.originReadCapacityBytesPerSecond > 0, true);
assert.equal(objectStorageTierModels["high-throughput"].uploadCapacityBytesPerSecond > objectStorageTierModels.standard.uploadCapacityBytesPerSecond, true);
assert.equal(objectStorageMonthlyBaseCostForConfig({ tier: "standard" }), objectStorageTierModels.standard.monthlyBaseCost);
assert.deepEqual(objectStorageDefinition.ports, [
  { id: "object_in", label: "Object operations", direction: "input", connectionTypes: ["object_io"] },
  { id: "object_out", label: "Object reads", direction: "output", connectionTypes: ["object_io"] },
]);

assert.equal(componentRegistry.get("queue"), queueDefinition);
assert.deepEqual(queueCapacityTiers, ["small", "large"]);
assert.deepEqual(queueDefinition.defaultConfig, { capacityTier: "small" });
assert.equal(queueDefinition.configSchema.safeParse({}).success, true);
assert.deepEqual(queueDefinition.configSchema.safeParse({}).data, { capacityTier: "small" });
assert.equal(queueDefinition.configSchema.safeParse({ capacityTier: "large" }).success, true);
assert.equal(queueDefinition.configSchema.safeParse({ capacityTier: "unbounded" }).success, false);
assert.equal(queueCapacityModels.large.capacityWorkUnits > queueCapacityModels.small.capacityWorkUnits, true);
assert.equal(queueCapacityWorkUnitsForConfig({ capacityTier: "large" }), queueCapacityModels.large.capacityWorkUnits);
assert.equal(queueMonthlyCostForConfig({ capacityTier: "small" }), queueCapacityModels.small.monthlyCost);
assert.equal(queueDefinition.simulation.bounded, true);
assert.equal(queueDefinition.simulation.queueDepthIsSimulatorEvidence, true);
assert.equal(queueDefinition.agentCapabilities.includes("inspect_queue"), true);
assert.deepEqual(queueDefinition.ports, [
  { id: "queue_in", label: "Enqueue work", direction: "input", connectionTypes: ["async_work"] },
  { id: "queue_out", label: "Consume work", direction: "output", connectionTypes: ["async_work"] },
]);
assert.equal(queueDefinition.metrics.some((metric) => metric.id === "oldest_job_age"), true);
assert.equal(queueDefinition.metrics.some((metric) => metric.id === "overflow_work_per_second"), true);
assert.equal(objectStorageDefinition.metrics.some((metric) => metric.id === "upload_throughput"), true);
assert.equal(objectStorageDefinition.metrics.some((metric) => metric.id === "origin_read_throughput"), true);
assert.equal(objectStorageDefinition.simulation.separatesUploadWritesAndOriginReads, true);
assert.equal(objectStorageDefinition.regionSupport, false);

assert.equal(componentRegistry.get("traffic-source"), trafficSourceDefinition);
assert.deepEqual(trafficSourceDefinition.defaultConfig, { label: "Incoming traffic" });
assert.deepEqual(trafficSourceDefinition.presentation, {
  glyph: "user",
  size: "standard",
  visualConfig: [],
  supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
});
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
  { id: "object_in", label: "Object storage", direction: "input", connectionTypes: ["object_io"] },
  { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] },
  { id: "object_out", label: "Object storage", direction: "output", connectionTypes: ["object_io"] },
  { id: "async_out", label: "Background work", direction: "output", connectionTypes: ["async_work"] },
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
