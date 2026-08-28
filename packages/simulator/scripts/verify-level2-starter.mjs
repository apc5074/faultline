import assert from "node:assert/strict";

import { getLevelStarterArchitecture, premiereNightChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements, propagateTraffic } from "../dist/index.js";

const architecture = getLevelStarterArchitecture("premiere-night");
const simulation = propagateTraffic({ architecture, challenge: premiereNightChallenge, registry: componentRegistry });
assert.equal(simulation.valid, true, "Premiere Night starter must be a valid architecture");
assert.ok(simulation.level2, "Premiere Night starter must expose Level 2 evidence");
assert.equal(simulation.level2.processingDeadlineCompletionRatio, 0, "starter has no processing consumer");
assert.ok(simulation.level2.playback.startupP95LatencyMs > 1000, "starter must expose origin-heavy playback startup");
const outcome = evaluateRequirements({ architecture, challenge: premiereNightChallenge, registry: componentRegistry });
assert.equal(outcome.valid, true, "Premiere Night starter must produce an outcome");
assert.ok(outcome.level2?.processing, "requirements evaluation must preserve Level 2 processing evidence");
console.log("Level 2 starter calibration verified");
