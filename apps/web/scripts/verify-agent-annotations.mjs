import assert from "node:assert/strict";

import { AGENT_ANNOTATION_MAX_COUNT, AGENT_NOTE_MAX_TEXT_LENGTH } from "@faultline/agent-capabilities";

assert.equal(AGENT_ANNOTATION_MAX_COUNT, 12);
assert.equal(AGENT_NOTE_MAX_TEXT_LENGTH, 280);

console.log("verify-agent-annotations: ok");
