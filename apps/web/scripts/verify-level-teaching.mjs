/**
 * LP-06 — Level Profile teaching surfaces (curriculum cards + compact agent teaching).
 *
 * Usage: pnpm --filter @faultline/web verify:level-teaching
 */
import assert from "node:assert/strict";

import {
  compactLevelTeachingForAgent,
  getLevelComponentCard,
  getLevelCurriculum,
} from "@faultline/challenges";

const curriculum = getLevelCurriculum("url-shortener");
assert.ok(curriculum.hook.toLowerCase().includes("viral") || curriculum.hook.includes("MegaDrop"));
assert.ok(curriculum.stakes.length > 20);
assert.ok(curriculum.briefingBeats.length >= 4);
assert.ok(curriculum.componentCards.redis);
assert.ok(curriculum.componentCards.cdn);

const redis = getLevelComponentCard("url-shortener", "redis");
assert.ok(redis);
assert.match(redis.placementIntent, /viral|read-aside/i);
assert.match(redis.whyHere, /not a substitute for edge|viral/i);
assert.ok(redis.cons.some((item) => /cdn|edge|average/i.test(item)));
assert.ok(!JSON.stringify(redis).toLowerCase().includes("add cdn here"));

assert.equal(getLevelComponentCard("tiny-api", "redis"), undefined);

const agentTeaching = compactLevelTeachingForAgent("url-shortener");
assert.ok(agentTeaching);
assert.equal(agentTeaching.narrative.hook, curriculum.hook);
assert.ok(agentTeaching.teaching.componentTypes.some((entry) => entry.type === "redis"));
const serialized = JSON.stringify(agentTeaching);
assert.ok(!serialized.includes("commonMistakes"));
assert.ok(!serialized.includes("playtestChecklist"));
assert.ok(!serialized.includes('"pros"'));

assert.equal(compactLevelTeachingForAgent("tiny-api"), undefined);

console.log("level teaching surfaces verified");
