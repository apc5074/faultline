import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "../../supabase/migrations/20260826171000_enforce_submission_limit.sql"),
  "utf8",
);

assert.match(migration, /create or replace function public\.enforce_submission_limit/i);
assert.match(migration, /from public\.attempts[\s\S]*for update/is);
assert.match(migration, /from public\.submissions[\s\S]*where attempt_id = new\.attempt_id/is);
assert.match(migration, /v_submission_count >= 50/i);
assert.match(migration, /official submission limit reached/i);
assert.match(migration, /create trigger submissions_enforce_limit/i);

const persistence = readFileSync(join(root, "lib/submissions/persist.ts"), "utf8");
assert.match(persistence, /isSubmissionLimitError/);
assert.match(persistence, /"submission_limit"/);

const route = readFileSync(join(root, "app/api/submissions/route.ts"), "utf8");
assert.match(route, /error\.code === "submission_limit"/);
assert.match(route, /status: error\.code === "misconfigured" \? 503 : error\.code === "submission_limit" \? 429 : 502/);

console.log("submission limit enforcement verified");
