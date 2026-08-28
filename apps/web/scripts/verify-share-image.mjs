import { readFileSync } from "node:fs";

const image = readFileSync(new URL("../app/s/[shareId]/opengraph-image.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/s/[shareId]/page.tsx", import.meta.url), "utf8");

for (const marker of ["ImageResponse", "getShareCard", "width: 1200", "height: 630", "PASSED", "formatDuration", "formatMoney", "Faultline result unavailable"]) {
  if (!image.includes(marker)) throw new Error(`Share image is missing ${marker}.`);
}
if (!image.includes("status")) throw new Error("Invalid share ids need an image response status.");
if (image.includes("architecture_json") || image.includes("architecture")) throw new Error("Share image must render payload facts only.");
if (!page.includes("opengraph-image")) throw new Error("Share page metadata is not wired to the image route.");

console.log("Share image checks passed.");
