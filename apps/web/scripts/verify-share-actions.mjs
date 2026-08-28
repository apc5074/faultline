import { readFileSync } from "node:fs";

const actions = readFileSync(new URL("../features/official-attempt/ShareResultActions.tsx", import.meta.url), "utf8");
const scorecard = readFileSync(new URL("../features/official-attempt/OfficialScorecard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

for (const marker of ["/api/shares", "submissionId", "Copy link", "Open preview", "Save image", "navigator.clipboard", "safe."]) {
  if (!actions.includes(marker)) throw new Error(`Share actions are missing ${marker}.`);
}
if (!actions.includes('if (!enabled) return null')) throw new Error("Share CTA must be gated on a verified pass.");
if (!scorecard.includes("ShareResultActions")) throw new Error("Scorecard is not wired to share actions.");
if (!scorecard.includes("enabled={passed && !stale}")) throw new Error("Stale or ineligible results must not be shareable.");
for (const marker of ["official-scorecard__share-buttons", "official-scorecard__share-status"]) {
  if (!css.includes(marker)) throw new Error(`Share action styling is missing ${marker}.`);
}

console.log("Share action checks passed.");
