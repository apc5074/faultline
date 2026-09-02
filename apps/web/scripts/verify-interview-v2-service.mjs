import assert from "node:assert/strict";
globalThis.window = { localStorage: new MapStorage() };
function MapStorage() { this.values = new Map(); this.getItem = (key) => this.values.get(key) ?? null; this.setItem = (key, value) => this.values.set(key, value); this.removeItem = (key) => this.values.delete(key); }
const { createDesignInterviewV2Service } = await import("../features/agent-session/interview-v2-service.ts");
const { INTERVIEW_V2_SKIP_LIVE_SCALE } = await import("@faultline/agent-capabilities");
const question = (ordinal, slotId, kind) => {
  if (kind === "live_scale") {
    return { kind, slotId, questionId: `q-${ordinal}`, ordinal, prompt: "Live", evidenceRevision: "rev-1", targetComponentId: "api", calibrationId: "cal-1", coachingObjective: "Explain." };
  }
  return {
    kind, slotId, questionId: `q-${ordinal}`, ordinal, prompt: "Discuss", evidenceRevision: "rev-1",
    assessment: {
      slotId,
      requiredTopics: ["topic-a", "topic-b"],
      evidenceSummary: ["Current evidence."],
      evidenceBasis: "test",
      assessGuidance: "Use requiredTopics only.",
    },
    ...(kind === "live_failure" ? { targetComponentId: "api" } : {}),
  };
};
const questions = INTERVIEW_V2_SKIP_LIVE_SCALE
  ? [
      question(1, "request-path-v2", "request_path"),
      question(2, "component-justification-v2", "component_justification"),
      question(3, "challenge-edge-case-v2", "challenge_edge_case"),
      question(4, "live-failure-v2", "live_failure"),
    ]
  : [
      question(1, "request-path-v2", "request_path"),
      question(2, "component-justification-v2", "component_justification"),
      question(3, "live-scale-v2", "live_scale"),
      question(4, "challenge-edge-case-v2", "challenge_edge_case"),
      question(5, "live-failure-v2", "live_failure"),
    ];
const service = createDesignInterviewV2Service("owner-1");
const started = service.start({
  type: "start",
  interviewId: "interview-1",
  architectureRevision: "rev-1",
  challengeId: "url-shortener",
  challengeVersion: 3,
  simulatorVersion: "sim-1",
  questions,
  startedAt: "fixed",
}, { version: 1, components: [], connections: [] });
assert.equal(started.state.questions.length, questions.length);
const panel = await (await import("node:fs/promises")).readFile(new URL("../features/agent-session/InterviewV2StatusPanel.tsx", import.meta.url), "utf8");
assert.equal(panel.includes("Question {ordinal} of {totalQuestions}"), true);
assert.equal(panel.includes("not an official submission"), true);
assert.equal(panel.includes("Answer in chat—do not edit the canvas."), true);
console.log("verify-interview-v2-service: ok");
