import { readFileSync } from "node:fs";

const tick = readFileSync(new URL("../features/traffic-playback/tick-simulation.ts", import.meta.url), "utf8");
const glyph = readFileSync(new URL("../features/playground-glyphs/ComponentGlyph.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

if (!tick.includes("processingDwellers.length / Math.max(1, comp.instances)")) throw new Error("Service load is still using raw pool packet count.");
if (!glyph.includes('className="server-bay"')) throw new Error("Server bays are missing a stable transition class.");
if (!css.includes(".server-bay") || !css.includes("transition: fill 180ms ease")) throw new Error("Server bay transition is missing.");

console.log("Stateless service animation checks passed.");
