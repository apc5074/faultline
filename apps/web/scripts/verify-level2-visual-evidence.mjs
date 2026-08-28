import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { selectComponentVisualEvidence } from "../features/traffic-playback/component-visual-evidence.ts";

const component = (id, type) => ({ id, type, config: type === "queue" ? { capacityTier: "small" } : type === "worker" ? { size: "standard", instances: 1 } : { tier: "standard" }, deployments: [], ui: { x: 0, y: 0 } });
const simulation = {
  services: {}, postgres: {}, caches: {},
  level2: {
    queues: { queue: { componentId: "queue", arrivalWorkPerSecond: 100, dequeueWorkPerSecond: 50, queueDepth: 40, queueCapacity: 120, oldestJobAgeMs: 2000, backlogGrowthRate: 50, overflowWorkPerSecond: 0, utilization: 1 / 3 } },
    workers: { worker: { componentId: "worker", receivedJobsPerSecond: 2, completedWorkPerSecond: 50, processingCapacity: 100, processingUtilization: 0.5, activeWork: 40, processingDelayMs: 800, unmetWorkPerSecond: 0 } },
    objectStorage: { storage: { componentId: "storage", uploadThroughputBytesPerSecond: 1000, uploadCapacityBytesPerSecond: 2000, originReadThroughputBytesPerSecond: 0, originReadCapacityBytesPerSecond: 2000, uploadUtilization: 0.5, originReadUtilization: 0, storedBytes: 1000000000, rejectedOrUnmetBytesPerSecond: 0 } },
    channels: {}, processingDeadlineMs: 300000, processingDeadlineCompletionRatio: 1,
    upload: { acceptedRps: 1, rejectedOrUnmetRps: 0, p95LatencyMs: 20, serviceDemandRps: 1, objectWriteDemandBytesPerSecond: 1000 },
    processing: { acceptedWorkPerSecond: 100, completedWorkPerSecond: 50, queueDepth: 40, oldestJobAgeMs: 2000, deadlineCompletionRatio: 1, deadlineMissRatio: 0 },
    playback: { requestedStartsPerSecond: 0, cdnHitStartsPerSecond: 0, originReadStartsPerSecond: 0, startupP95LatencyMs: 0, originReadBytesPerSecond: 0 },
    events: [],
  },
};

for (const [id, type] of [["queue", "queue"], ["worker", "worker"], ["storage", "object-storage"]]) {
  const evidence = selectComponentVisualEvidence({ component: component(id, type), simulation, redirectRps: 0 });
  assert.notEqual(evidence.evidenceLabel, undefined);
  assert.ok(evidence.processingCount >= 0);
}
assert.equal(selectComponentVisualEvidence({ component: component("queue", "queue"), simulation, redirectRps: 0 }).processingCount, 1);
console.log("Level 2 visual evidence verified");
