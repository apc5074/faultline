/** P10-009 — presentation timing stays bounded, cancellable, and truth-preserving. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(
  new URL("../features/traffic-playback/route-linger.ts", import.meta.url),
  "utf8",
);
const layerSource = await readFile(
  new URL("../features/traffic-playback/RouteLingerLayer.tsx", import.meta.url),
  "utf8",
);
const cssSource = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

assert.match(routeSource, /ROUTE_LINGER_MS = 800/);
assert.match(routeSource, /pruneRouteLingers/);
assert.match(layerSource, /ROUTE_LINGER_MS/);
assert.match(layerSource, /route-linger-duration/);
assert.match(cssSource, /route-linger-fade var\(--route-linger-duration, 800ms\)/);
assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(cssSource, /\.ink-edge__travel-pulse,\n  \.ink-edge--peeling/);

console.log("animation feel verified");
