import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertLevelProfile, type LevelProfileV1 } from "./level-profile.js";

const levelsDir = join(dirname(fileURLToPath(import.meta.url)), "levels");

/**
 * Load and validate a Level Profile JSON from disk (Node / verify / scaffold).
 * Product challenge modules should prefer a static JSON import + compile at
 * module init so Next/Edge bundling never needs `fs`.
 */
export function loadLevelProfile(slug: string): LevelProfileV1 {
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Invalid level profile slug: ${slug}`);
  }
  const path = join(levelsDir, `${slug}.level.json`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  assertLevelProfile(raw);
  return raw;
}
