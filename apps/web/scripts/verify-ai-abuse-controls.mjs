import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveNetworkUsageKey,
  getTrustedClientAddress,
} from "../lib/ai/network-identity.ts";

const secret = "test-secret";
const first = deriveNetworkUsageKey("203.0.113.9", secret);
assert.equal(first, deriveNetworkUsageKey("203.0.113.9", secret));
assert.notEqual(first, deriveNetworkUsageKey("203.0.113.10", secret));
assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(
  getTrustedClientAddress(new Headers({ "x-vercel-forwarded-for": "203.0.113.9" }), true),
  "203.0.113.9",
);
assert.equal(getTrustedClientAddress(new Headers({ "x-forwarded-for": "203.0.113.9" }), true), null);
assert.equal(
  getTrustedClientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), false),
  "203.0.113.9",
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826170000_harden_agent_usage_limits.sql"),
  "utf8",
);
assert.match(migration, /reserve_agent_usage_pair/i);
assert.match(migration, /order by usage_key\s+for update/is);
assert.match(migration, /requests = requests \+ 1/i);
assert.doesNotMatch(migration, /requests = greatest\(0, requests \+/i);
assert.match(migration, /grant execute[\s\S]*reserve_agent_usage_pair[\s\S]*to service_role/is);

const route = readFileSync(join(root, "app/api/agent/route.ts"), "utf8");
assert.match(route, /resolveAgentNetworkUsageKey\(request\.headers\)/);
assert.match(route, /guestKey: guestId/);

console.log("AI abuse controls verified");
