/**
 * AUTH-003 — GitHub OAuth route logic tests with a fake auth adapter.
 */
import assert from "node:assert/strict";

import {
  appendAuthCallbackQuery,
  handleOAuthCallback,
  mapAuthErrorToCallbackCode,
  startGitHubOAuth,
} from "../lib/auth/github-oauth.ts";
import { normalizeAuthCallbackRedirect } from "../lib/auth/account-status.ts";

function fakeUser(input) {
  return {
    id: input.id,
    is_anonymous: input.isAnonymous ?? false,
    identities: input.isAnonymous ? [] : [{ provider: "github" }],
  };
}

function createFakeAdapter(state) {
  return {
    async getUser() {
      return state.user;
    },
    async signInWithOAuth() {
      state.oauthStarted = true;
      return { url: "https://example.test/oauth", error: null };
    },
    async linkIdentity() {
      state.linkStarted = true;
      if (state.linkError) return { url: null, error: state.linkError };
      return { url: "https://example.test/link", error: null };
    },
    async exchangeCodeForSession(code, flowId) {
      state.exchangedCode = code;
      state.exchangedFlowId = flowId;
      if (state.exchangeError) return { error: state.exchangeError };
      state.user = fakeUser({ id: "permanent-1", isAnonymous: false });
      return { error: null };
    },
    async signOut() {
      state.user = null;
      return { error: null };
    },
  };
}

console.log("redirect allowlist");
assert.equal(normalizeAuthCallbackRedirect("/level/1"), "/level/1");
assert.equal(normalizeAuthCallbackRedirect("https://evil.test/nope"), "/");
assert.equal(normalizeAuthCallbackRedirect("/account"), "/account");

console.log("start oauth — guest uses signInWithOAuth");
{
  const state = { user: null, oauthStarted: false, linkStarted: false };
  const adapter = createFakeAdapter(state);
  const result = await startGitHubOAuth(adapter, {
    callbackUrl: "https://faultline.test/auth/callback?next=%2Flevel%2F1",
    next: "/level/1",
  });
  assert.equal(result.ok, true);
  assert.ok(state.oauthStarted);
  assert.equal(state.linkStarted, false);
}

console.log("start oauth — anonymous uses linkIdentity");
{
  const state = { user: fakeUser({ id: "anon-1", isAnonymous: true }), oauthStarted: false, linkStarted: false };
  const adapter = createFakeAdapter(state);
  const result = await startGitHubOAuth(adapter, {
    callbackUrl: "https://faultline.test/auth/callback?next=%2F",
    next: "/",
  });
  assert.equal(result.ok, true);
  assert.equal(state.linkStarted, true);
  assert.equal(state.oauthStarted, false);
}

console.log("start oauth — permanent user short-circuits");
{
  const state = { user: fakeUser({ id: "perm-1" }), oauthStarted: false, linkStarted: false };
  const adapter = createFakeAdapter(state);
  const result = await startGitHubOAuth(adapter, { callbackUrl: "https://faultline.test/auth/callback", next: "/" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "already_signed_in");
}

console.log("start oauth — disabled manual linking is configuration error");
{
  const state = {
    user: fakeUser({ id: "anon-1", isAnonymous: true }),
    oauthStarted: false,
    linkStarted: false,
    linkError: { message: "Manual linking is disabled" },
  };
  const adapter = createFakeAdapter(state);
  const result = await startGitHubOAuth(adapter, {
    callbackUrl: "https://faultline.test/auth/callback?next=%2F",
    next: "/",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "misconfigured");
}

console.log("callback — provider denial");
{
  const state = { user: null };
  const adapter = createFakeAdapter(state);
  const result = await handleOAuthCallback(adapter, {
    code: null,
    providerError: "access_denied",
    next: "/level/1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "provider_denied");
  assert.equal(result.next, "/level/1");
}

console.log("callback — missing code");
{
  const state = { user: null };
  const adapter = createFakeAdapter(state);
  const result = await handleOAuthCallback(adapter, { code: null, providerError: null, next: "/evil" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_callback");
  assert.equal(result.next, "/");
}

console.log("callback — success");
{
  const state = { user: null, exchangedCode: null };
  const adapter = createFakeAdapter(state);
  const result = await handleOAuthCallback(adapter, {
    code: "abc",
    flowId: "flow-1",
    providerError: null,
    next: "/level/1",
  });
  assert.equal(result.ok, true);
  assert.equal(state.exchangedCode, "abc");
  assert.equal(state.exchangedFlowId, "flow-1");
}

console.log("callback — expired code mapping");
{
  const state = { user: null, exchangeError: { message: "code expired" } };
  const adapter = createFakeAdapter(state);
  const result = await handleOAuthCallback(adapter, { code: "stale", providerError: null, next: "/" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "expired_code");
}

console.log("auth error mapping — disabled provider is configuration error");
assert.equal(mapAuthErrorToCallbackCode({ message: "Provider is disabled" }), "misconfigured");

console.log("callback query builder");
assert.match(appendAuthCallbackQuery("/", { error: "provider_denied" }), /\?auth_error=provider_denied/);
assert.match(appendAuthCallbackQuery("/level/1", { signedIn: true }), /\?auth_signed_in=1/);

console.log("auth error mapping");
assert.equal(mapAuthErrorToCallbackCode({ message: "invalid grant expired" }), "expired_code");
assert.equal(mapAuthErrorToCallbackCode({ message: "identity already linked" }), "identity_conflict");

console.log("route files present");
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const rel of [
  "app/api/auth/github/route.ts",
  "app/auth/callback/route.ts",
  "features/account/AccountAuthPlate.tsx",
]) {
  const path = join(root, rel);
  assert.ok(existsSync(path), `missing ${rel}`);
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|client_secret|AI_GATEWAY_API_KEY/);
}

const githubRoute = readFileSync(join(root, "app/api/auth/github/route.ts"), "utf8");
assert.match(githubRoute, /startGitHubOAuth/);
assert.doesNotMatch(githubRoute, /POST/);

const callbackRoute = readFileSync(join(root, "app/auth/callback/route.ts"), "utf8");
assert.match(callbackRoute, /exchangeCodeForSession|handleOAuthCallback/);
assert.match(callbackRoute, /sb_flow_id/);
assert.match(callbackRoute, /ensureProfileForUser/);

console.log("verify:github-oauth ok");
