import assert from "node:assert/strict";

import { getLevelProfile, premiereNightChallenge } from "../dist/index.js";
import { assertLevelProfile } from "../dist/level-profile.js";

const profile = getLevelProfile("premiere-night");
assert.equal(profile.identity.slug, "premiere-night");
assert.equal(profile.identity.title, "Premiere Night");
assert.equal(profile.identity.developmentOnly, false);
assert.equal(profile.sandbox.components.length, 10);
assert.deepEqual(new Set(profile.sandbox.components.map((card) => card.type)), new Set([
  "traffic-source", "global-router", "load-balancer", "service", "cdn",
  "redis", "postgres", "object-storage", "queue", "worker",
]));
assert.equal(profile.workloadChannels?.find((channel) => channel.id === "upload")?.ratePerSecond, 100);
assert.equal(profile.workloadChannels?.find((channel) => channel.id === "upload")?.bytesPerOperation, 1_000_000_000);
assert.equal(profile.workloadChannels?.find((channel) => channel.id === "processing")?.workUnitsPerOperation, 40);
assert.equal(profile.workloadChannels?.find((channel) => channel.id === "playback-start")?.ratePerSecond, 150_000);
assert.equal(profile.workloadChannels?.find((channel) => channel.id === "playback-start")?.hotShare, 0.6);
assert.ok(profile.workloadAffinity?.mechanisms.object_store);
assert.ok(profile.workloadAffinity?.mechanisms.async_buffer);
assert.ok(profile.workloadAffinity?.mechanisms.async_consumer);
assert.deepEqual(profile.firstRunExpectation.expectedFailingRequirementIds, ["processing-deadline", "playback-startup"]);
assert.equal(premiereNightChallenge.allowedComponentTypes.length, 10);
assert.equal("narrative" in premiereNightChallenge, false);
assert.equal("starterArchitecture" in premiereNightChallenge, false);
assert.doesNotThrow(() => assertLevelProfile(profile));

console.log("premiere-night level profile verified");
