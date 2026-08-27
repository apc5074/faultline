import assert from "node:assert/strict";

import {
  getDevExperimentHarnessStatus,
  isDevExperimentHarnessEnabled,
} from "../lib/experiments/dev-harness-flag.ts";

assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "true" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "on" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "development", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "false" }), false);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "test", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "1" }), true);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "true" }), false);
assert.equal(isDevExperimentHarnessEnabled({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "1" }), false);

assert.deepEqual(
  getDevExperimentHarnessStatus({ NODE_ENV: "production", NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: "true" }),
  {
    enabled: false,
    code: "DEV_EXPERIMENTS_DISABLED",
    message: "Development experiment controls are disabled in this environment.",
  },
);

console.log("development experiment flag verified");
