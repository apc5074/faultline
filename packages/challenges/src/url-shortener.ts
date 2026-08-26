import type { ChallengeDefinition } from "@faultline/core";

import { assertChallengeDefinition } from "./validation.js";

/** Redirect (read) RPS for the Global URL Shortener. */
export const urlShortenerRedirectRps = 120_000;
/** New-link (write) RPS for the Global URL Shortener. */
export const urlShortenerWriteRps = 4_000;
/** Combined challenge RPS = redirects + writes (30:1). */
export const urlShortenerTotalRps = urlShortenerRedirectRps + urlShortenerWriteRps;

/**
 * Level 1 product challenge: Global URL Shortener.
 *
 * Geographic shares are challenge-owned. Phase 3 activates them through simulator
 * regional workload derivation (traffic origins). Nearest-region routing arrives later.
 * Availability remains an unscored target until truthful resilience semantics exist.
 */
export const urlShortenerChallenge: ChallengeDefinition = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt:
    "Design infrastructure for a global URL shortening service. It must absorb heavy redirect traffic, accept new links, survive a viral short URL, and stay within latency, capacity headroom, and monthly budget — without a prescribed topology.",
  developmentOnly: false,
  workload: {
    requestsPerSecond: urlShortenerTotalRps,
    readRatio: urlShortenerRedirectRps / urlShortenerTotalRps,
    writeRatio: urlShortenerWriteRps / urlShortenerTotalRps,
    hotKeyReadFraction: 0.25,
  },
  geographicDistribution: [
    { regionId: "us-east", fraction: 0.25 },
    { regionId: "us-west", fraction: 0.2 },
    { regionId: "europe", fraction: 0.25 },
    { regionId: "india", fraction: 0.1 },
    { regionId: "singapore", fraction: 0.1 },
    { regionId: "tokyo", fraction: 0.1 },
  ],
  unscoredTargets: [
    {
      id: "availability",
      label: "Availability",
      target: 0.9999,
      unit: "ratio",
      reason: "Deferred until truthful resilience and failure semantics exist. Not scored in Phase 2.",
    },
  ],
  requirements: [
    { id: "throughput", label: "Throughput", type: "throughput", comparator: "gte", target: 1, unit: "ratio" },
    { id: "latency", label: "Redirect p95 latency", type: "latency", comparator: "lt", target: 150, unit: "ms" },
    { id: "headroom", label: "Capacity headroom", type: "headroom", comparator: "gte", target: 0.2, unit: "ratio" },
    {
      id: "budget",
      label: "Monthly infrastructure budget",
      type: "budget",
      comparator: "lte",
      target: 85_000,
      unit: "usd/month",
    },
  ],
  monthlyBudget: 85_000,
  allowedComponentTypes: [
    "traffic-source",
    "global-router",
    "load-balancer",
    "service",
    "cdn",
    "redis",
    "postgres",
  ],
};

assertChallengeDefinition(urlShortenerChallenge);
