import { readFileSync } from "node:fs";

const card = readFileSync(new URL("../lib/share/cards.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20260827100000_share_cards.sql", import.meta.url), "utf8");
const postRoute = readFileSync(new URL("../app/api/shares/route.ts", import.meta.url), "utf8");
const getRoute = readFileSync(new URL("../app/api/shares/[shareId]/route.ts", import.meta.url), "utf8");

for (const text of [card, migration, postRoute, getRoute]) {
  if (!text) throw new Error("Share card contract file is empty.");
}

for (const field of ["version: 1", "shareId", "challengeSlug", "challengeTitle", "challengeDay", "alias", "outcome: \"passed\"", "solveTimeMs", "monthlyCostUsd", "budgetUsd", "fastestRank", "cheapestRank", "createdAt"]) {
  if (!card.includes(field)) throw new Error(`ShareCardV1 is missing ${field}.`);
}
if (!card.includes("Only verified passing submissions can be shared")) throw new Error("Pass-only mint guard is missing.");
if (!card.includes("Submission does not belong to the current user")) throw new Error("Ownership guard is missing.");
if (!card.includes('eq("submission_id", submissionId)')) throw new Error("Submission idempotency lookup is missing.");
if (card.includes("architecture_json") || card.includes("architecture:")) throw new Error("Share payload must not include architecture data.");
if (!migration.includes("submission_id uuid not null unique")) throw new Error("Share rows must be idempotent per submission.");
if (!postRoute.includes("createShareFromSubmission") || !getRoute.includes("getShareCard")) throw new Error("Share routes are not connected to server helpers.");

console.log("Share card contract checks passed.");
