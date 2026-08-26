import assert from "node:assert/strict";
import { ChallengeDefinitionError, assertChallengeDefinition, tinyApiChallenge } from "../dist/index.js";

assert.equal(tinyApiChallenge.slug, "tiny-api");
assert.equal(tinyApiChallenge.version, 1);
assert.equal(tinyApiChallenge.developmentOnly, true);
assert.deepEqual(tinyApiChallenge.workload, { requestsPerSecond: 6000, readRatio: 0.9, writeRatio: 0.1 });
assert.equal(tinyApiChallenge.workload.requestsPerSecond * tinyApiChallenge.workload.readRatio, 5400);
assert.equal(tinyApiChallenge.workload.requestsPerSecond * tinyApiChallenge.workload.writeRatio, 600);
assert.equal(tinyApiChallenge.monthlyBudget, 8000);
assert.deepEqual(tinyApiChallenge.allowedComponentTypes, ["traffic-source", "service", "postgres"]);
assert.equal(tinyApiChallenge.requirements.length, 4);
assert.equal(tinyApiChallenge.requirements.find((requirement) => requirement.id === "latency")?.target, 200);
assert.throws(() => assertChallengeDefinition({ ...tinyApiChallenge, slug: "Tiny API" }), ChallengeDefinitionError);
assert.throws(() => assertChallengeDefinition({ ...tinyApiChallenge, workload: { ...tinyApiChallenge.workload, readRatio: 0.8 } }), ChallengeDefinitionError);
console.log("tiny API challenge verified");
