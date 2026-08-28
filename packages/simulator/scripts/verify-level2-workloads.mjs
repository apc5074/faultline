import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { propagateTraffic } from "../dist/index.js";

const ui = (x) => ({ x, y: 0 });
const component = (id, type, config) => ({ id, type, config, deployments: [], ui: ui(0) });
const edge = (id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type) => ({
  id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type,
});

const challenge = {
  ...urlShortenerChallenge,
  allowedComponentTypes: [...new Set([...urlShortenerChallenge.allowedComponentTypes, "cdn", "queue", "worker", "object-storage"])],
  workloadChannels: [
    { id: "upload", kind: "object_io", ratePerSecond: 100, bytesPerOperation: 100_000_000 },
    { id: "processing", kind: "async_work", ratePerSecond: 100, workUnitsPerOperation: 40 },
    { id: "playback-start", kind: "request", ratePerSecond: 150_000, bytesPerOperation: 1_000_000 },
  ],
};

function architecture(workerInstances = 4) {
  return {
    version: 1,
    components: [
      component("source", "traffic-source", { label: "Users" }),
      component("cdn", "cdn", { coverage: 1, ttlBand: "long", tier: "large" }),
      component("service", "service", { size: "large", instances: 8 }),
      component("queue", "queue", { capacityTier: "large" }),
      component("worker", "worker", { size: workerInstances === 1 ? "standard" : "performance", instances: workerInstances }),
      component("storage", "object-storage", { tier: "high-throughput" }),
    ],
    connections: [
      edge("source-cdn", "source", "request_out", "cdn", "request_in", "request"),
      edge("cdn-service", "cdn", "origin_out", "service", "request_in", "request"),
      edge("service-queue", "service", "async_out", "queue", "queue_in", "async_work"),
      edge("queue-worker", "queue", "queue_out", "worker", "queue_in", "async_work"),
      edge("service-storage", "service", "object_out", "storage", "object_in", "object_io"),
      edge("storage-worker", "storage", "object_out", "worker", "object_in", "object_io"),
    ],
  };
}

function run(workerInstances) {
  const result = propagateTraffic({ architecture: architecture(workerInstances), challenge, registry: componentRegistry });
  assert.equal(result.valid, true);
  return result;
}

const healthy = run(4);
assert.ok(healthy.level2, "Level 2 channels must produce workload evidence");
assert.equal(healthy.level2.processingDeadlineCompletionRatio, 1);
assert.ok(healthy.level2.playback.cdnHitStartsPerSecond > 0);
assert.ok(healthy.level2.playback.originReadStartsPerSecond < healthy.level2.playback.requestedStartsPerSecond);
assert.ok(healthy.level2.objectStorage.storage.uploadUtilization > 0, "object storage must report upload pressure");

const underprovisioned = run(1);
assert.ok(underprovisioned.level2.processingDeadlineCompletionRatio < 1, "insufficient Workers must miss the processing deadline");
assert.ok(Object.values(underprovisioned.level2.queues)[0].queueDepth > 0, "insufficient Workers must grow queue depth");
assert.deepEqual(run(4), healthy, "Level 2 evidence must be deterministic");

console.log("Level 2 workload simulation verified");
