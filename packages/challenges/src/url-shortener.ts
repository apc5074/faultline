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
  version: 2,
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
  /**
   * Educational payload sizes for COST-005 cross-region transfer projection.
   * Documented tuning assumptions — not measured production traffic.
   */
  transferPayload: {
    redirectResponseBytes: 800,
    writeRequestBytes: 1_200,
    databaseReadBytes: 1_024,
    databaseWriteBytes: 512,
    replicationBytesPerWrite: 512,
  },
  coachingPolicy: {
    focusThemes: [
      "hot-key resilience",
      "read scaling",
      "global latency",
      "cache-workload-fit",
      "placement-fit",
      "mechanism-fit",
    ],
    prohibitedRevealCategories: [
      "canonical topology",
      "specific component requirements",
      "solution-only thresholds",
    ],
  },
  workloadAffinity: {
    roleDefaults: {
      unreachable: 0,
      misplaced: 0.05,
      write_path: 0.1,
    },
    mechanisms: {
      edge_cache: {
        maxEffectiveness: 0.88,
        byRole: { edge_ingress: 1.0, path_middleware: 0.4, misplaced: 0.05 },
        reuseConcentration: 0.7,
        note: "Redirects are highly edge-cacheable when CDN sits on the user path.",
      },
      data_cache: {
        maxEffectiveness: 0.3,
        byRole: { read_aside: 1.0, edge_ingress: 0.25, path_middleware: 0.2 },
        reuseConcentration: 0.8,
        note: "In-memory cache helps hot keys beside the DB; weak as a substitute for edge cache.",
      },
      request_fanout: {
        maxEffectiveness: 0.9,
        byRole: { path_middleware: 1.0 },
        note: "Load balancing pays off when multiple healthy upstreams exist on path.",
      },
      geo_routing: {
        maxEffectiveness: 0.85,
        byRole: { geo_route: 1.0, path_middleware: 0.5 },
        note: "Routing matters when traffic spans regions.",
      },
      stateless_compute: {
        maxEffectiveness: 1.0,
        byRole: { compute: 1.0 },
      },
      durable_store: {
        maxEffectiveness: 1.0,
        byRole: { primary_store: 1.0, replica_store: 1.0 },
        unitCostPressure: 1.0,
      },
    },
  },
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
