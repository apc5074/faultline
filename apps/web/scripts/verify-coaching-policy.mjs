import assert from "node:assert/strict";
import { urlShortenerChallenge } from "@faultline/challenges";
import { buildCoachingPolicy, validateAgentComponentReferences } from "../lib/ai/coaching-policy.ts";

const context = { challenge: urlShortenerChallenge, architecture: { version: 1, components: [{ id: "postgres-main" }], connections: [] } };
const policy = buildCoachingPolicy(context);
assert.match(policy, /hot-key resilience/);
assert.match(policy, /Never change architecture/);
assert.deepEqual(validateAgentComponentReferences([{ componentId: "postgres-main", reason: "finding" }, { componentId: "invented", reason: "finding" }], context), [{ componentId: "postgres-main", reason: "finding" }]);
console.log("verify-coaching-policy: ok");
