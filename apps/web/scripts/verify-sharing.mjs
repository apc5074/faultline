import { readFileSync } from "node:fs";

const actions = readFileSync(new URL("../features/official-attempt/ShareResultActions.tsx", import.meta.url), "utf8");
const scorecard = readFileSync(new URL("../features/official-attempt/OfficialScorecard.tsx", import.meta.url), "utf8");
const card = readFileSync(new URL("../lib/share/cards.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20260827100000_share_cards.sql", import.meta.url), "utf8");
const postRoute = readFileSync(new URL("../app/api/shares/route.ts", import.meta.url), "utf8");
const getRoute = readFileSync(new URL("../app/api/shares/[shareId]/route.ts", import.meta.url), "utf8");
const image = readFileSync(new URL("../app/s/[shareId]/opengraph-image.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/s/[shareId]/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

for (const text of [actions, scorecard, card, migration, postRoute, getRoute, image, page, css]) {
  if (!text) throw new Error("Sharing contract file is empty.");
}

for (const marker of [
  "/api/shares", "submissionId", "Copy link", "Open preview", "Save image",
  "navigator.clipboard", "safe.",
]) {
  if (!actions.includes(marker)) throw new Error(`Share actions are missing ${marker}.`);
}
if (!actions.includes("if (!enabled) return null")) throw new Error("Share CTA must be gated on a verified pass.");
if (!scorecard.includes("ShareResultActions")) throw new Error("Scorecard is not wired to share actions.");
if (!scorecard.includes("enabled={passed && !stale}")) throw new Error("Stale or ineligible results must not be shareable.");
for (const marker of ["official-scorecard__share-buttons", "official-scorecard__share-status"]) {
  if (!css.includes(marker)) throw new Error(`Share action styling is missing ${marker}.`);
}

for (const field of [
  "version: 1", "shareId", "challengeSlug", "challengeTitle", "challengeDay", "alias",
  "outcome: \"passed\"", "solveTimeMs", "monthlyCostUsd", "budgetUsd", "fastestRank",
  "cheapestRank", "createdAt",
]) {
  if (!card.includes(field)) throw new Error(`ShareCardV1 is missing ${field}.`);
}
if (!card.includes("Only verified passing submissions can be shared")) throw new Error("Pass-only mint guard is missing.");
if (!card.includes("Submission does not belong to the current user")) throw new Error("Ownership guard is missing.");
if (!card.includes('eq("submission_id", submissionId)')) throw new Error("Submission idempotency lookup is missing.");
if (card.includes("architecture_json") || card.includes("architecture:")) throw new Error("Share payload must not include architecture data.");
if (!migration.includes("submission_id uuid not null unique")) throw new Error("Share rows must be idempotent per submission.");
if (!postRoute.includes("createShareFromSubmission") || !getRoute.includes("getShareCard")) throw new Error("Share routes are not connected to server helpers.");

for (const marker of [
  "ImageResponse", "getShareCard", "width: 1200", "height: 630", "PASSED", "formatDuration",
  "formatMoney", "Faultline result unavailable",
]) {
  if (!image.includes(marker)) throw new Error(`Share image is missing ${marker}.`);
}
if (!image.includes("status")) throw new Error("Invalid share ids need an image response status.");
if (image.includes("architecture_json") || image.includes("architecture")) throw new Error("Share image must render payload facts only.");
if (!page.includes("opengraph-image")) throw new Error("Share page metadata is not wired to the image route.");

for (const marker of [
  "generateMetadata", "openGraph", "twitter", "opengraph-image", "Server-verified. Architecture stays private.",
  "Play today&apos;s Faultline", "notFound()",
]) {
  if (!page.includes(marker)) throw new Error(`Share page is missing ${marker}.`);
}
for (const marker of [".share-page", ".share-card", "@media (max-width: 34rem)"]) {
  if (!css.includes(marker)) throw new Error(`Share page styling is missing ${marker}.`);
}
if (page.includes("architecture_json") || page.includes("architecture")) throw new Error("Public share page must not expose architecture data.");

console.log("sharing contracts verified");
