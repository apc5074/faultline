import { readFileSync } from "node:fs";

const canvas = readFileSync(new URL("../features/architecture-canvas/PlaygroundCanvas.tsx", import.meta.url), "utf8");
const scorecard = readFileSync(new URL("../features/official-attempt/OfficialScorecard.tsx", import.meta.url), "utf8");
const sharePage = readFileSync(new URL("../app/s/[shareId]/page.tsx", import.meta.url), "utf8");
const shareImage = readFileSync(new URL("../app/s/[shareId]/opengraph-image.tsx", import.meta.url), "utf8");

if (!canvas.includes("Drag a component here to start. Connect ports, then Run.")) throw new Error("Empty canvas needs one clear first action.");
for (const text of [scorecard, sharePage, shareImage]) {
  if (!text.includes("p95 latency") || !text.includes("Headroom")) throw new Error("Requirement labels are not aligned across result surfaces.");
}
if (canvas.includes("Drag components from the rail · Connect ports · Press Run")) throw new Error("Old dense empty-state copy remains.");

console.log("Copy audit checks passed.");
