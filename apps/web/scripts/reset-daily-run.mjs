/**
 * Reset one player's persisted official competition history.
 *
 * This is intentionally a narrow operator tool for local competition testing.
 * It does not delete the account, profile/alias, agent usage, or any other
 * user's data. Without --confirm it only reports what would change.
 *
 * Usage (from apps/web):
 *   pnpm reset:all-runs
 *   pnpm reset:all-runs -- --confirm
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

const attempts = await supabase
  .from("attempts")
  .select("id, daily_challenge_id, started_at, first_valid_at")
  .eq("user_id", matchedUser.id);
if (attempts.error) {
  console.error(`Could not inspect attempts: ${attempts.error.message}`);
  process.exit(1);
}

const attemptIds = attempts.data.map((attempt) => attempt.id);
const submissions = await supabase
  .from("submissions")
  .select("id, daily_challenge_id, all_requirements_pass, within_budget")
  .eq("user_id", matchedUser.id);
if (submissions.error) {
  console.error(`Could not inspect submissions: ${submissions.error.message}`);
  process.exit(1);
}

const submissionIds = submissions.data.map((submission) => submission.id);
const summary = `${attemptIds.length} attempt(s), ${submissionIds.length} submission(s), and daily-best rows for every challenge`;
console.log(
  `${confirmed ? "Resetting" : "Would reset"} all persisted official data for @${username}: ${summary}.`
);

if (!confirmed) {
  console.log("Dry run only. Re-run with --confirm to delete these rows.");
  process.exit(0);
}

let reset = await supabase.rpc("reset_player_daily_run", {
  p_user_id: matchedUser.id,
});
// Older local databases expose the safer challenge-scoped overload instead of
// the newer all-history operator RPC. Fall back only to the exact attempts
// discovered above; never broaden the deletion scope in the compatibility path.
if (
  reset.error &&
  /Could not find the function .*reset_player_daily_run\(p_user_id\)/i.test(reset.error.message) &&
  attempts.data.length > 0
) {
  const scopedResults = [];
  for (const attempt of attempts.data) {
    const scoped = await supabase.rpc("reset_player_daily_run", {
      p_user_id: matchedUser.id,
      p_daily_challenge_id: attempt.daily_challenge_id,
    });
    if (scoped.error) {
      reset = scoped;
      break;
    }
    scopedResults.push(scoped.data ?? {});
  }
  if (scopedResults.length === attempts.data.length) {
    reset = {
      data: {
        attempts: scopedResults.reduce((sum, value) => sum + Number(value.attempts ?? 0), 0),
        submissions: scopedResults.reduce((sum, value) => sum + Number(value.submissions ?? 0), 0),
        daily_best: scopedResults.reduce((sum, value) => sum + Number(value.daily_best ?? 0), 0),
        share_cards: scopedResults.reduce((sum, value) => sum + Number(value.share_cards ?? 0), 0),
      },
      error: null,
    };
  }
}
if (reset.error) {
  throw new Error(
    `Could not reset player data: ${reset.error.message}. Apply the latest Supabase migration first.`
  );
}

console.log(
  `Reset complete for @${username}: ${reset.data.attempts} attempt(s), ${reset.data.submissions} submission(s), ${reset.data.daily_best} daily-best row(s), and ${reset.data.share_cards} share card(s) removed. Account and alias were preserved.`
);
