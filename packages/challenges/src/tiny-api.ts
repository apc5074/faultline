import type { ChallengeDefinition } from "@faultline/core";

import { assertChallengeDefinition } from "./validation.js";

/** Development-only vertical-slice challenge. It contains configuration, not simulator logic. */
export const tinyApiChallenge: ChallengeDefinition = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API that can handle the required traffic while staying within budget.",
  developmentOnly: true,
  workload: {
    requestsPerSecond: 6_000,
    readRatio: 0.9,
    writeRatio: 0.1,
  },
  requirements: [
    { id: "throughput", label: "Throughput", type: "throughput", comparator: "gte", target: 1, unit: "ratio" },
    { id: "latency", label: "p95 latency", type: "latency", comparator: "lt", target: 200, unit: "ms" },
    { id: "headroom", label: "Capacity headroom", type: "headroom", comparator: "gte", target: 0.2, unit: "ratio" },
    { id: "budget", label: "Monthly infrastructure budget", type: "budget", comparator: "lte", target: 8_000, unit: "usd/month" },
  ],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["traffic-source", "service", "postgres"],
};

assertChallengeDefinition(tinyApiChallenge);
