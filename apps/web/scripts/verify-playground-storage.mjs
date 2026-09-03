import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const draft = await readFile(new URL("../features/architecture-canvas/playground-architecture-utils.ts", import.meta.url), "utf8");
const intro = await readFile(new URL("../features/architecture-canvas/level-intro-storage.ts", import.meta.url), "utf8");
const link = await readFile(new URL("../features/home/PlayLevelLink.tsx", import.meta.url), "utf8");

assert.match(draft, /faultline:draft:v1:\$\{slug\}:\$\{version\}/);
assert.match(draft, /challenge:\s*\{\s*slug:\s*challenge\.slug,\s*version:\s*challenge\.version/);
assert.match(draft, /envelope\.challenge\?\.slug !== slug/);
assert.match(draft, /envelope\.challenge\.version !== version/);
assert.match(intro, /faultline:intro-pending:v1:\$\{slug\}/);
assert.match(intro, /markLevelIntroPending\(slug: string\)/);
assert.match(intro, /consumeLevelIntroPending\(slug: string\)/);
assert.match(link, /markLevelIntroPending\("url-shortener"\)/);

console.log("playground storage verified");
