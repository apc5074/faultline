import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/s/[shareId]/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

for (const marker of ["generateMetadata", "openGraph", "twitter", "opengraph-image", "Server-verified. Architecture stays private.", "Play today&apos;s Faultline", "notFound()"])
  if (!page.includes(marker)) throw new Error(`Share page is missing ${marker}.`);
for (const marker of [".share-page", ".share-card", "@media (max-width: 34rem)"])
  if (!css.includes(marker)) throw new Error(`Share page styling is missing ${marker}.`);
if (page.includes("architecture_json") || page.includes("architecture")) throw new Error("Public share page must not expose architecture data.");

console.log("Share page checks passed.");
