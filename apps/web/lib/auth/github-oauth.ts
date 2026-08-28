import type { AuthError } from "@supabase/supabase-js";

import {
  type AuthCallbackErrorCode,
  type AuthCallbackRedirectPath,
  normalizeAuthCallbackRedirect,
} from "./account-status.ts";
import type { AuthAdapter } from "./auth-adapter.ts";

export type StartGitHubOAuthResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; code: "misconfigured" | "oauth_start_failed" | "already_signed_in"; next: AuthCallbackRedirectPath };

export type HandleOAuthCallbackInput = {
  code: string | null;
  flowId?: string | null;
  providerError: string | null;
  next: string | null;
};

export type HandleOAuthCallbackResult =
  | { ok: true; next: AuthCallbackRedirectPath }
  | { ok: false; code: AuthCallbackErrorCode; next: AuthCallbackRedirectPath };

/** User-facing messages for callback errors (no secrets). */
export const AUTH_CALLBACK_ERROR_MESSAGES: Record<AuthCallbackErrorCode, string> = {
  misconfigured: "Sign-in is not configured yet. You can keep playing anonymously.",
  provider_denied: "GitHub sign-in was cancelled. Your session is unchanged.",
  invalid_callback: "That sign-in link was invalid. Try again from the game.",
  expired_code: "That sign-in link expired. Try again from the game.",
  session_missing: "We could not restore your session after sign-in. Try again.",
  link_failed: "GitHub sign-in could not be completed. Try again or keep playing anonymously.",
  link_incomplete: "GitHub sign-in did not finish linking your account. Try again.",
  identity_conflict:
    "That GitHub account is already linked to another player. Use a different GitHub account or keep playing without linking.",
  network_error: "GitHub sign-in is temporarily unavailable. Try again later.",
};

export function mapAuthErrorToCallbackCode(error: AuthError | null): AuthCallbackErrorCode {
  if (!error) return "link_failed";
  const message = error.message.toLowerCase();
  // Anonymous progress is preserved through Supabase's native linkIdentity
  // flow. That flow is rejected until Manual Identity Linking is enabled in
  // the Supabase Auth configuration; surface it as an operator configuration
  // problem instead of implying the player can fix it by retrying.
  if (
    message.includes("manual linking") ||
    message.includes("provider is disabled") ||
    message.includes("provider is not enabled") ||
    message.includes("unsupported provider")
  ) {
    return "misconfigured";
  }
  if (message.includes("expired") || message.includes("invalid grant")) return "expired_code";
  if (message.includes("code") || message.includes("verifier") || message.includes("state")) {
    return "invalid_callback";
  }
  if (message.includes("network") || message.includes("fetch")) return "network_error";
  if (message.includes("already") && message.includes("identity")) return "identity_conflict";
  return "link_failed";
}

/**
 * Starts GitHub OAuth. Anonymous sessions use linkIdentity so competition data
 * stays on the same auth.users id when linking succeeds.
 */
export async function startGitHubOAuth(
  adapter: AuthAdapter,
  input: { callbackUrl: string; next: string | null },
): Promise<StartGitHubOAuthResult> {
  const next = normalizeAuthCallbackRedirect(input.next);
  const user = await adapter.getUser();

  if (user && user.is_anonymous !== true) {
    return { ok: false, code: "already_signed_in", next };
  }

  const start = user
    ? await adapter.linkIdentity({ redirectTo: input.callbackUrl })
    : await adapter.signInWithOAuth({ redirectTo: input.callbackUrl });

  if (start.error || !start.url) {
    const code = mapAuthErrorToCallbackCode(start.error);
    return {
      ok: false,
      code: code === "misconfigured" ? "misconfigured" : "oauth_start_failed",
      next,
    };
  }

  return { ok: true, redirectUrl: start.url };
}

/** Exchanges an OAuth callback for a session and maps provider failures safely. */
export async function handleOAuthCallback(
  adapter: AuthAdapter,
  input: HandleOAuthCallbackInput,
): Promise<HandleOAuthCallbackResult> {
  const next = normalizeAuthCallbackRedirect(input.next);

  if (input.providerError) {
    if (input.providerError === "access_denied") {
      return { ok: false, code: "provider_denied", next };
    }
    return { ok: false, code: "invalid_callback", next };
  }

  if (!input.code) {
    return { ok: false, code: "invalid_callback", next };
  }

  const exchanged = await adapter.exchangeCodeForSession(input.code, input.flowId);
  if (exchanged.error) {
    return { ok: false, code: mapAuthErrorToCallbackCode(exchanged.error), next };
  }

  const user = await adapter.getUser();
  if (!user) {
    return { ok: false, code: "session_missing", next };
  }

  return { ok: true, next };
}

export function appendAuthCallbackQuery(
  path: AuthCallbackRedirectPath,
  input: { error?: AuthCallbackErrorCode; signedIn?: boolean; linked?: boolean },
): string {
  const url = new URL(path, "http://local");
  if (input.error) url.searchParams.set("auth_error", input.error);
  if (input.signedIn) url.searchParams.set("auth_signed_in", "1");
  if (input.linked) url.searchParams.set("auth_linked", "1");
  return `${url.pathname}${url.search}`;
}
