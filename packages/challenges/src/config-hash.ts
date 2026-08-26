import { createHash } from "node:crypto";

import type { ChallengeDefinition } from "@faultline/core";

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

/** Deterministic SHA-256 hex digest of a challenge definition for audit/integrity. */
export function hashChallengeConfig(definition: ChallengeDefinition): string {
  const canonical = JSON.stringify(canonicalizeJson(definition));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
