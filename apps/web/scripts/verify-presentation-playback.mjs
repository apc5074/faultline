import assert from "node:assert/strict";

import { createPlaybackEvents } from "../features/traffic-playback/presentation-events.ts";
import {
  advancePresentationPlayback,
  cancelPresentationPlayback,
  createPresentationPlaybackState,
  preparePresentationPlayback,
  settlePresentationPlayback,
  startPresentationPlayback,
} from "../features/traffic-playback/presentation-playback.ts";

const events = createPlaybackEvents({
  runId: "baseline-001",
  source: "baseline",
  events: [
    { type: "traffic_routed", data: { requestsPerSecond: 10_000 } },
    { type: "component_saturated", componentId: "service", data: { utilization: 1.25 } },
  ],
});

assert.equal(createPresentationPlaybackState().phase, "idle");

let state = preparePresentationPlayback(events);
assert.equal(state.phase, "preparing");
assert.equal(state.currentEvent, null);

state = startPresentationPlayback(state);
state = advancePresentationPlayback(state);
assert.equal(state.phase, "playing");
assert.equal(state.currentEvent, events[0]);

state = advancePresentationPlayback(state);
assert.equal(state.currentEvent, events[1]);
state = advancePresentationPlayback(state);
assert.equal(state.phase, "settled");
assert.equal(state.currentEvent, events[1], "settled state retains final evidence");

state = cancelPresentationPlayback(preparePresentationPlayback(events));
assert.equal(state.phase, "cancelled");
assert.equal(state.currentEvent, null);
assert.equal(state.events.length, 0);

assert.throws(() => preparePresentationPlayback([]), /at least one authoritative event/);
assert.throws(
  () => preparePresentationPlayback([events[0], { ...events[1], runId: "experiment-001" }]),
  /one run and source/,
);
assert.throws(
  () => preparePresentationPlayback([events[1], events[0]]),
  /strictly increasing sequences/,
);

const settled = settlePresentationPlayback(startPresentationPlayback(preparePresentationPlayback(events)));
assert.equal(settled.phase, "settled");
assert.equal(settled.currentEvent, events[1]);

console.log("presentation playback state machine verified");
