import { createHash } from "node:crypto";

import type { Architecture, ChallengeDefinition } from "@faultline/core";

/** Recursively sort object keys so JSON serialization is stable across runtimes. */
export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      sorted[key] = canonicalizeJson(record[key]);
    }
    return sorted;
  }
  return value;
}

function sha256Hex(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

/** Deterministic SHA-256 hex digest of a challenge definition for audit/integrity. */
export function hashChallengeConfig(definition: ChallengeDefinition): string {
  return sha256Hex(JSON.stringify(canonicalizeJson(definition)));
}

/**
 * Deterministic SHA-256 hex digest of an architecture for audit / duplicate detection.
 * Always compute server-side; never trust a client-supplied hash.
 */
export function hashArchitecture(architecture: Architecture): string {
  return sha256Hex(JSON.stringify(canonicalizeJson(architecture)));
}
