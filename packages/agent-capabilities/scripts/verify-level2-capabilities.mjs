import assert from "node:assert/strict";

import { buildGetChallengeOutput, buildGetMetricsOutput, createDefaultCapabilityRegistry, resolveCapabilities } from "../dist/index.js";

const premiereNightChallenge = { slug: "premiere-night", version: 1, title: "Premiere Night", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 150000, readRatio: 1, writeRatio: 0 }, workloadChannels: [{ id: "processing", kind: "async_work", ratePerSecond: 100, workUnitsPerOperation: 40 }], requirements: [], monthlyBudget: 120000, allowedComponentTypes: ["traffic-source", "service", "queue", "worker", "object-storage"] };

const architecture = { version: 1, components: [{ id: "source", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } }, { id: "service", type: "service", config: { size: "medium", instances: 2 }, deployments: [], ui: { x: 0, y: 0 } }, { id: "storage-start", type: "object-storage", config: { tier: "standard" }, deployments: [], ui: { x: 0, y: 0 } }], connections: [{ id: "source-service", sourceComponentId: "source", sourcePortId: "request_out", targetComponentId: "service", targetPortId: "request_in", type: "request" }] };
architecture.components.push(
  { id: "queue", type: "queue", config: { capacityTier: "small" }, deployments: [], ui: { x: 0, y: 0 } },
  { id: "worker", type: "worker", config: { size: "standard", instances: 2 }, deployments: [], ui: { x: 0, y: 0 } },
);
const simulation = { available: true, components: {
  queue: { metrics: { queueDepth: 10, queueCapacity: 120, arrivalWorkPerSecond: 100, dequeueWorkPerSecond: 50, oldestJobAgeMs: 1000, overflowWorkPerSecond: 0, backlogGrowthRate: 50, utilization: 0.08 }, state: "processing" },
  worker: { metrics: { completedWorkPerSecond: 50, processingCapacity: 100, processingUtilization: 0.5, processingDelayMs: 800, unmetWorkPerSecond: 0 }, state: "processing" },
  "storage-start": { metrics: { storedBytes: 1000, uploadUtilization: 0.2, originReadUtilization: 0.1 }, state: "idle" },
} };
const context = { challenge: premiereNightChallenge, architecture, simulation, cost: { monthlyTotal: 0, lineItems: [] } };
const challengeOutput = buildGetChallengeOutput(premiereNightChallenge);
assert.deepEqual(challengeOutput.channels.map((channel) => channel.id), ["processing"]);
assert.equal(challengeOutput.channels[0]?.kind, "async_work");
const metricsOutput = buildGetMetricsOutput({
  ...context,
  simulation: {
    ...simulation,
    scenarios: {
      processing: { deadlineCompletionRatio: 0.5, deadlineMissRatio: 0.5 },
      playback: { requestedStartsPerSecond: 150000, cdnHitStartsPerSecond: 90000, originReadStartsPerSecond: 60000, startupP95LatencyMs: 1200, originReadBytesPerSecond: 60000000000 },
    },
  },
});
assert.equal(metricsOutput.scenarios.processing?.deadlineCompletionRatio, 0.5);
assert.equal(metricsOutput.scenarios.playback?.startupP95LatencyMs, 1200);
const registry = createDefaultCapabilityRegistry();
const resolved = resolveCapabilities(registry, context);
for (const name of ["inspect_queue", "inspect_processing", "inspect_object_storage", "inspect_playback_origin"]) assert.ok(resolved.names.includes(name), `${name} should resolve`);
const withoutQueue = { ...context, architecture: { ...architecture, components: architecture.components.filter((component) => component.type !== "queue") } };
assert.ok(!resolveCapabilities(registry, withoutQueue).names.includes("inspect_queue"));
console.log("Level 2 agent capabilities verified");
