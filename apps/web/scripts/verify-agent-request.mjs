import { urlShortenerChallenge } from "@faultline/challenges";
import { createAgentContext, parseAgentRequest } from "../lib/ai/agent-request.ts";

const architecture = {
  version: 1,
  components: [],
  connections: [],
};

const valid = parseAgentRequest({
  challengeVersionId: "challenge-version-id",
  architecture,
  messages: [{ role: "user", content: "Where is my bottleneck?" }],
});
if (!valid.success || valid.data.messages[0].role !== "user") {
  throw new Error("Agent request parser did not accept the minimal guest request.");
}

const invalidArchitecture = parseAgentRequest({
  challengeVersionId: "challenge-version-id",
  architecture: { version: 2, components: [], connections: [] },
  messages: [{ role: "user", content: "Hello" }],
});
if (invalidArchitecture.success || !invalidArchitecture.architectureErrors?.length) {
  throw new Error("Agent request parser must return architecture validation errors.");
}

const multiTurn = parseAgentRequest({
  challengeVersionId: "challenge-version-id",
  architecture,
  messages: [
    ...Array.from({ length: 7 }, (_, index) => ({ role: "user", content: `Question ${index}` })),
    ...Array.from({ length: 7 }, (_, index) => ({ role: "assistant", content: `Answer ${index}` })),
    { role: "user", content: "Current question" },
  ],
});
if (!multiTurn.success || multiTurn.data.messages.length !== 12) {
  throw new Error("Agent request must reduce conversation to the configured rolling window.");
}
if (multiTurn.data.messages[0]?.content !== "Question 3" || multiTurn.data.messages.at(-1)?.content !== "Current question") {
  throw new Error("Conversation reduction must predictably preserve the newest turns.");
}

const unsupportedRole = parseAgentRequest({
  challengeVersionId: "challenge-version-id",
  architecture,
  messages: [{ role: "tool", content: "Hidden tool history" }, { role: "user", content: "Current question" }],
});
if (unsupportedRole.success) throw new Error("Tool history must not enter the rolling conversation context.");

const context = createAgentContext(architecture, urlShortenerChallenge);
if (context.simulation?.available !== false || context.cost !== undefined) {
  throw new Error("Invalid simulation must not manufacture simulator or cost evidence.");
}

console.log("Agent request validation and simulator-backed context verified.");
