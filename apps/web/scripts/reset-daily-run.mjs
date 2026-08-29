/**
 * Reset one player's official run for the currently active UTC challenge.
 *
 * This is intentionally a narrow operator tool for local competition testing.
 * It does not delete the account, profile/alias, agent usage, or data from
 * other challenge days. Without --confirm it only reports what would change.
 *
 * Usage (from apps/web):
 *   pnpm reset:daily-run
 *   pnpm reset:daily-run -- --confirm
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  try {
    const source = readFileSync(path, "utf8");
    for (const line of source.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Local env files are optional when variables are already exported.
  }
}

loadEnvFile(resolve(process.cwd(), "../../.env"));
loadEnvFile(resolve(process.cwd(), ".env"));

const username = "apc5074";
const confirmed = process.argv.includes("--confirm");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function providerUsername(user) {
  const metadata = user.user_metadata ?? {};
  const identity = user.identities?.find((entry) => entry.provider === "github");
  const identityData = identity?.identity_data ?? {};
  const value =
    metadata.user_name ??
    metadata.preferred_username ??
    metadata.login ??
    identityData.user_name ??
    identityData.login;
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

let matchedUser = null;
for (let page = 1; ; page += 1) {
  const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (result.error) {
    console.error(`Could not list users: ${result.error.message}`);
    process.exit(1);
  }

  const matches = result.data.users.filter(
    (user) => providerUsername(user) === username
  );
  if (matches.length > 1) {
    console.error(`Found multiple Supabase users for GitHub @${username}.`);
    process.exit(1);
  }
  if (matches[0]) {
    matchedUser = matches[0];
    break;
  }
  if (result.data.users.length < 1000) break;
}

if (!matchedUser) {
  console.error(`Could not find GitHub user @${username}.`);
  process.exit(1);
}

const now = new Date().toISOString();
const active = await supabase
  .from("daily_challenges")
  .select("id, starts_at, ends_at, challenge_version_id")
  .lte("starts_at", now)
  .gt("ends_at", now)
  .maybeSingle();

if (active.error) {
  console.error(`Could not find active challenge: ${active.error.message}`);
  process.exit(1);
}
if (!active.data) {
  console.error("There is no active daily challenge right now.");
  process.exit(1);
}

const challengeId = active.data.id;
const attempts = await supabase
  .from("attempts")
  .select("id, started_at, first_valid_at")
  .eq("user_id", matchedUser.id)
  .eq("daily_challenge_id", challengeId);
if (attempts.error) {
  console.error(`Could not inspect attempts: ${attempts.error.message}`);
  process.exit(1);
}

const attemptIds = attempts.data.map((attempt) => attempt.id);
const submissions = attemptIds.length
  ? await supabase
      .from("submissions")
      .select("id, all_requirements_pass, within_budget")
      .in("attempt_id", attemptIds)
  : { data: [], error: null };
if (submissions.error) {
  console.error(`Could not inspect submissions: ${submissions.error.message}`);
  process.exit(1);
}

const submissionIds = submissions.data.map((submission) => submission.id);
const summary = `${attemptIds.length} attempt(s), ${submissionIds.length} submission(s), and at most ${attemptIds.length} daily-best row(s)`;
console.log(
  `${confirmed ? "Resetting" : "Would reset"} @${username} for challenge ${challengeId}: ${summary}.`
);

if (!confirmed) {
  console.log("Dry run only. Re-run with --confirm to delete these rows.");
  process.exit(0);
}

const reset = await supabase.rpc("reset_player_daily_run", {
  p_user_id: matchedUser.id,
  p_daily_challenge_id: challengeId,
});
if (reset.error) {
  throw new Error(
    `Could not reset daily run: ${reset.error.message}. Apply the latest Supabase migration first.`
  );
}

console.log(
  `Reset complete for @${username}: ${reset.data.attempts} attempt(s), ${reset.data.submissions} submission(s), and ${reset.data.daily_best} daily-best row(s) removed. Account and alias were preserved.`
);
