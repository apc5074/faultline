import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../features/traffic-playback/use-playback-controller.ts", import.meta.url), "utf8");
const map = readFileSync(new URL("../features/world-map/WorldMap.tsx", import.meta.url), "utf8");
const image = readFileSync(new URL("../app/s/[shareId]/opengraph-image.tsx", import.meta.url), "utf8");

if (!controller.includes("useEffect(() => () => {") || !controller.includes("stopLoop();")) throw new Error("Playback RAF cleanup is missing.");
if (!controller.includes("cancelAnimationFrame(raf)")) throw new Error("Route linger RAF cleanup is missing.");
if (!map.includes("memo(function WorldMap")) throw new Error("World map is not memoized against playback-only rerenders.");
if (!image.includes("unstable_cache") || !image.includes("share-card")) throw new Error("Share image is not cached by share id.");

console.log("Performance polish checks passed.");
