import assert from "node:assert/strict";

import { createPlaybackEvents } from "../features/traffic-playback/presentation-events.ts";

const first = {
  type: "traffic_routed",
  connectionId: "source-to-service",
  data: { requestsPerSecond: 10_000 },
};
const second = {
  type: "component_saturated",
  componentId: "service",
  data: { utilization: 1.25, unmetRps: 2_000 },
};

const baseline = createPlaybackEvents({
  runId: "baseline-001",
  source: "baseline",
  events: [first, second],
});

assert.deepEqual(
  baseline.map(({ runId, source, sequence }) => ({ runId, source, sequence })),
  [
    { runId: "baseline-001", source: "baseline", sequence: 0 },
    { runId: "baseline-001", source: "baseline", sequence: 1 },
  ],
);
assert.equal(baseline[0].event, first, "the envelope must retain the original event");
assert.equal(baseline[1].event, second, "the envelope must retain the original event");

const experiment = createPlaybackEvents({
  runId: "experiment-001",
  source: "experiment",
  events: [first],
  startSequence: 4,
});
assert.equal(experiment[0].sequence, 4);
assert.equal(experiment[0].source, "experiment");

assert.throws(
  () => createPlaybackEvents({ runId: " ", source: "baseline", events: [] }),
  /non-empty runId/,
);

console.log("presentation event envelope verified");
