import assert from "node:assert/strict";

import {
  getDevExperimentHarnessStatus,
  isDevExperimentHarnessEnabled,
} from "../lib/experiments/dev-harness-flag.ts";

// Explicit on
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "true" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "on" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "test", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "1" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "true" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "1" }), true);

// Explicit off always wins
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "false" }), false);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "0" }), false);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "test", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "off" }), false);

// Unset defaults: on in development/test, off in production
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "test" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "production" }), false);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: undefined }), false);

assert.deepEqual(
  getDevExperimentHarnessStatus({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "true" }),
  { enabled: true },
);
assert.deepEqual(
  getDevExperimentHarnessStatus({ NODE_ENV: "production" }),
  {
    enabled: false,
    code: "DEV_EXPERIMENTS_DISABLED",
    message: "Development experiment controls are disabled in this environment.",
  },
);

console.log("development experiment flag verified");
