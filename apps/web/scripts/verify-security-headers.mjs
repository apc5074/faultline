import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(join(root, "next.config.ts"), "utf8");

assert.match(config, /async headers\(\)/);
assert.match(config, /source: "\/:path\*"/);
assert.match(config, /Content-Security-Policy/);
assert.match(config, /default-src 'self'/);
assert.match(config, /object-src 'none'/);
assert.match(config, /base-uri 'self'/);
assert.match(config, /form-action 'self'/);
assert.match(config, /frame-ancestors 'none'/);
assert.match(config, /X-Content-Type-Options.*nosniff/);
assert.match(config, /Referrer-Policy.*strict-origin-when-cross-origin/);
assert.match(config, /X-Frame-Options.*DENY/);
assert.match(config, /Permissions-Policy/);
assert.match(config, /Strict-Transport-Security/);

console.log("security headers verified");
