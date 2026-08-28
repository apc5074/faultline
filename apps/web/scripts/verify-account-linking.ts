/**
 * AUTH-004 — anonymous linking, conflict handling, sign-out, and migration checks.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { finalizeAnonymousLink } from "../lib/auth/finalize-link.ts";
import { ACCOUNT_LINK_COOKIE } from "../lib/auth/account-status.ts";
import { appendAuthCallbackQuery } from "../lib/auth/github-oauth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");

function read(rel: string) {
  const path = join(root, rel);
  assert.ok(existsSync(path), `missing ${rel}`);
  return readFileSync(path, "utf8");
}

console.log("finalize link — preserved anonymous id");
assert.deepEqual(
  finalizeAnonymousLink({
    linkIntentUserId: "anon-1",
    userId: "anon-1",
    isAnonymous: false,
    hasGitHubProvider: true,
  }),
  { ok: true, kind: "linked" },
);

console.log("finalize link — identity conflict");
assert.deepEqual(
  finalizeAnonymousLink({
    linkIntentUserId: "anon-1",
    userId: "other-user",
    isAnonymous: false,
    hasGitHubProvider: true,
  }),
  { ok: false, code: "identity_conflict" },
);

console.log("finalize link — incomplete");
assert.deepEqual(
  finalizeAnonymousLink({
    linkIntentUserId: "anon-1",
    userId: "anon-1",
    isAnonymous: true,
    hasGitHubProvider: false,
  }),
  { ok: false, code: "link_incomplete" },
);

console.log("finalize link — returning sign-in without intent");
assert.deepEqual(
  finalizeAnonymousLink({
    linkIntentUserId: null,
    userId: "perm-1",
    isAnonymous: false,
    hasGitHubProvider: true,
  }),
  { ok: true, kind: "returning_sign_in" },
);

console.log("callback query — linked flag");
assert.match(appendAuthCallbackQuery("/", { linked: true }), /\?auth_linked=1/);

console.log("link session cookie name");
assert.equal(ACCOUNT_LINK_COOKIE, "faultline_link_uid");

console.log("migration — account_link_attempts");
const migration = readFileSync(
  join(repo, "supabase/migrations/20260827123000_account_link_attempts.sql"),
  "utf8",
);
assert.match(migration, /account_link_attempts/);
assert.match(migration, /source_user_id uuid not null references auth\.users/);
assert.match(migration, /outcome in \('started', 'linked', 'conflict', 'failed', 'cancelled'\)/);
assert.match(migration, /enable row level security/);
assert.doesNotMatch(migration, /create policy/i);

console.log("routes and UI");
const githubRoute = read("app/api/auth/github/route.ts");
assert.match(githubRoute, /setAccountLinkIntent/);
assert.match(githubRoute, /recordAccountLinkAttempt/);

const callbackRoute = read("app/auth/callback/route.ts");
assert.match(callbackRoute, /finalizeAnonymousLink/);
assert.match(callbackRoute, /signOut/);
assert.match(callbackRoute, /identity_conflict/);
assert.match(callbackRoute, /linked: true/);

const signOutRoute = read("app/api/auth/sign-out/route.ts");
assert.match(signOutRoute, /signOut/);
assert.doesNotMatch(signOutRoute, /signInAnonymously/);

const plate = read("features/account/AccountAuthPlate.tsx");
assert.match(plate, /Link your progress/);
assert.match(plate, /alias, official attempt, submissions, and leaderboard rank/);
assert.match(plate, /sign-out/);

const meRoute = read("app/api/auth/me/route.ts");
assert.match(meRoute, /linkingState: linkIntentUserId \? "pending" : "idle"/);

console.log("verify:account-linking ok");
