import assert from "node:assert/strict";
import { selectInterviewEdgeCase, validateInterviewQ4Answer } from "../dist/index.js";

const curriculum = { settingFacts: ["Six regions share 120k redirects per second."], edgeCaseCards: [{ id: "viral-short-code-hot-key", setting: "One short code receives 25% of redirect traffic.", promptCore: "One URL suddenly receives 25% of all traffic. How does your current system behave?", expectedTopics: ["request path", "cache concentration", "hot-key pressure"], acceptableTradeoffs: ["edge offload versus freshness"], commonMisconceptions: ["aggregate throughput alone proves the hot key is safe"], allowedProbeAngles: ["trace the hot request", "identify the first bottleneck"], difficulty: "early_career" }] };
const question = selectInterviewEdgeCase({ curriculum, evidenceRevision: "rev-1", candidateCardId: "q4-viral-short-code-hot-key", probeAngle: "trace the hot request" });
assert.equal(question.question.selectionSource, "model");
assert.equal(question.question.prompt.includes("25%"), true);
assert.equal(question.simulatorUsed, false);
assert.equal(question.rubricBasis, "authored_edge_case_and_general_reasoning");
assert.deepEqual(question.rubric.requiredTopics, ["request path", "cache concentration", "hot-key pressure"]);
assert.equal(question.evidence.simulatorUsed, false);
assert.equal(question.evidence.verifiedFacts.includes(question.setting), true);
assert.equal(selectInterviewEdgeCase({ curriculum, evidenceRevision: "rev-1", candidateCardId: "q4-missing" }).question.selectionSource, "deterministic_fallback");
assert.equal(validateInterviewQ4Answer({ questionId: question.questionId, evidenceRevision: "rev-1", answer: "Trace the request and discuss freshness.", verdict: "partial", coveredTopics: ["request path"], namedTradeoffs: ["freshness"], simulatorUsed: false }, question).ok, true);
assert.equal(validateInterviewQ4Answer({ questionId: question.questionId, evidenceRevision: "old", answer: "stale", verdict: "incorrect", coveredTopics: [], namedTradeoffs: [], simulatorUsed: false }, question).code, "STALE_QUESTION");
console.log("verify-interview-q4: ok");
