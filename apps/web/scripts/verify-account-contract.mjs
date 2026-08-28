/**
 * ACCT-001 contract checks — typed exports and redirect allowlist.
 */
import assert from "node:assert/strict";

import {
  AUTH_CALLBACK_REDIRECT_ALLOWLIST,
  accountStatusFromAuthMe,
  isAuthCallbackRedirectAllowed,
  normalizeAuthCallbackRedirect,
} from "../lib/auth/account-status.ts";

assert.equal(AUTH_CALLBACK_REDIRECT_ALLOWLIST.length, 4);
assert.ok(isAuthCallbackRedirectAllowed("/level/1"));
assert.ok(isAuthCallbackRedirectAllowed("/"));
assert.ok(isAuthCallbackRedirectAllowed("/play"));
assert.ok(!isAuthCallbackRedirectAllowed("/evil"));
assert.equal(normalizeAuthCallbackRedirect("https://evil.com"), "/");
assert.equal(normalizeAuthCallbackRedirect("/play?x=1"), "/play");

const guest = { authenticated: false, configured: true };
assert.equal(accountStatusFromAuthMe(guest).kind, "guest");

const anon = {
  authenticated: true,
  configured: true,
  userId: "u",
  isAnonymous: true,
  alias: "SwiftFox42",
};
assert.equal(accountStatusFromAuthMe(anon).kind, "anonymous");

const permanent = {
  authenticated: true,
  configured: true,
  userId: "u",
  isAnonymous: false,
  alias: "SwiftFox42",
  provider: "github",
};
assert.equal(accountStatusFromAuthMe(permanent).kind, "permanent");

console.log("verify:account-contract ok");
