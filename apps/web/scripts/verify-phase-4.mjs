/**
 * PHASE-4-VERIFY — automated slice (code + local verifies).
 * Does not replace production E2E (Verification 26) or live Supabase race tests.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");
const web = join(repo, "apps/web");
const migrations = join(repo, "supabase/migrations");

function read(path) {
  return readFileSync(path, "utf8");
}

function assertFile(rel) {
  const path = join(repo, rel);
  assert.ok(existsSync(path), `missing ${rel}`);
  return read(path);
}

console.log("Check — Phase 4 tickets / migrations present");
const migrationFiles = readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort();
for (const required of [
  "20260826145000_profiles.sql",
  "20260826151000_challenge_versions.sql",
  "20260826154000_attempts.sql",
  "20260826160000_submissions.sql",
  "20260826162000_daily_best.sql",
  "20260826164000_fastest_leaderboard.sql",
  "20260826165000_cheapest_leaderboard.sql",
  "20260826166000_my_leaderboard_ranks.sql",
]) {
  assert.ok(migrationFiles.includes(required), `missing migration ${required}`);
}

console.log("Check — competition API surface");
for (const route of [
  "apps/web/app/api/auth/anonymous/route.ts",
  "apps/web/app/api/auth/me/route.ts",
  "apps/web/app/api/challenges/active/route.ts",
  "apps/web/app/api/attempts/start/route.ts",
  "apps/web/app/api/attempts/current/route.ts",
  "apps/web/app/api/submissions/route.ts",
  "apps/web/app/api/leaderboards/fastest/route.ts",
  "apps/web/app/api/leaderboards/cheapest/route.ts",
  "apps/web/app/api/leaderboards/me/route.ts",
]) {
  assertFile(route);
}

console.log("Check — no login wall / shared simulator");
const page = assertFile("apps/web/app/page.tsx");
assert.match(page, /ArchitectureCanvas/);
assert.doesNotMatch(page, /Sign in to play|Sign in with|GitHub OAuth/i);

const canvas = assertFile("apps/web/features/architecture-canvas/ArchitectureCanvas.tsx");
assert.match(canvas, /evaluateRequirements/);
assert.match(canvas, /Submit Official|onSubmitOfficial/);
assert.match(canvas, /StartOfficialAttempt|LeaderboardHud|PlayerRankHud/);
assert.doesNotMatch(canvas, /Sign in to play/);

const submissions = assertFile("apps/web/app/api/submissions/route.ts");
assert.match(submissions, /verifySubmission/);
assert.match(submissions, /commitVerifiedSubmission/);
assert.match(submissions, /getCurrentAuthUser/);
assert.doesNotMatch(submissions, /body\.(cost|p95|passed|solveTime)/);

const verifyLib = assertFile("apps/web/lib/competition/verify-submission.ts");
assert.match(verifyLib, /evaluateRequirements/);
assert.match(verifyLib, /@faultline\/simulator/);

const start = assertFile("apps/web/app/api/attempts/start/route.ts");
assert.match(start, /Start Official|startOfficial|attempts\/start|idempotent|ensure/i);

const dailyBest = assertFile("supabase/migrations/20260826162000_daily_best.sql");
assert.match(dailyBest, /commit_verified_submission/);
assert.match(dailyBest, /fastest\* stay locked|fastest_solve_ms/i);
assert.match(dailyBest, /cheapest_cost/);
assert.match(dailyBest, /for update/);

const attempts = assertFile("supabase/migrations/20260826154000_attempts.sql");
assert.match(attempts, /unique|user_id.*daily_challenge|daily_challenge_id.*user_id/i);
assert.match(attempts, /first_valid_at/);
assert.match(attempts, /started_at/);

console.log("Check — leaderboard public + ranks private identity");
const fastest = assertFile("apps/web/app/api/leaderboards/fastest/route.ts");
assert.doesNotMatch(fastest, /getCurrentAuthUser/);
const cheapest = assertFile("apps/web/app/api/leaderboards/cheapest/route.ts");
assert.doesNotMatch(cheapest, /getCurrentAuthUser/);
const me = assertFile("apps/web/app/api/leaderboards/me/route.ts");
assert.match(me, /getMyLeaderboardRanks/);

const hud = assertFile("apps/web/features/leaderboards/LeaderboardHud.tsx");
assert.match(hud, /Fastest/);
assert.match(hud, /Cheapest/);
const rankHud = assertFile("apps/web/features/leaderboards/PlayerRankHud.tsx");
assert.match(rankHud, /Unranked/);
assert.doesNotMatch(rankHud, /\buserId\b|\buser_id\b/);

console.log("Check — Phase 5+ not pulled forward as product features");
const forbidden = [
  "GitHub OAuth",
  "account linking",
  "embedded AI Engineer",
  "AI usage accounting",
  "attack mode",
  "complex anti-cheat",
];
const scanRoots = [
  join(web, "app"),
  join(web, "features"),
  join(web, "lib"),
];
for (const dir of scanRoots) {
  // light file walk
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue;
      const source = read(full);
      for (const phrase of forbidden) {
        assert.ok(
          !source.toLowerCase().includes(phrase.toLowerCase()),
          `${full} must not implement "${phrase}"`,
        );
      }
    }
  }
}

console.log("phase 4 automated verification slice ok");
console.log("NOTE: run `pnpm --filter @faultline/web verify:phase-4-live` against a server wired to hosted Supabase; confirm production URL smoke separately if BASE_URL was local.");
