import { NextResponse } from "next/server";

import type { AuthCallbackErrorCode } from "@/lib/auth/account-status";
import { createSupabaseAuthAdapter } from "@/lib/auth/auth-adapter";
import { finalizeAnonymousLink } from "@/lib/auth/finalize-link";
import { appendAuthCallbackQuery, handleOAuthCallback } from "@/lib/auth/github-oauth";
import { recordAccountLinkAttempt } from "@/lib/auth/link-audit";
import { clearAccountLinkIntent, readAccountLinkIntent } from "@/lib/auth/link-session";
import { getAccountProvider } from "@/lib/auth/provider";
import { ensureProfileForUser, ProfileAliasError } from "@/lib/auth/profile";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function mapFinalizeCode(code: "identity_conflict" | "link_incomplete" | "session_missing"): AuthCallbackErrorCode {
  return code;
}

/** Supabase OAuth callback — exchanges code, verifies link integrity, redirects safely. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const origin = getRequestOrigin(request) ?? url.origin;
  const linkIntentUserId = await readAccountLinkIntent();

  if (!getSupabasePublicConfig()) {
    return NextResponse.redirect(
      new URL(appendAuthCallbackQuery("/", { error: "misconfigured" }), origin),
    );
  }

  const supabase = await createSupabaseServerClient();
  const adapter = createSupabaseAuthAdapter(supabase);

  if (url.searchParams.get("error") === "access_denied" && linkIntentUserId) {
    await recordAccountLinkAttempt(linkIntentUserId, "cancelled");
    await clearAccountLinkIntent();
  }

  const result = await handleOAuthCallback(adapter, {
    code: url.searchParams.get("code"),
    providerError: url.searchParams.get("error"),
    next,
  });

  if (!result.ok) {
    if (linkIntentUserId) {
      await recordAccountLinkAttempt(linkIntentUserId, result.code === "provider_denied" ? "cancelled" : "failed");
      await clearAccountLinkIntent();
    }
    return NextResponse.redirect(
      new URL(appendAuthCallbackQuery(result.next, { error: result.code }), origin),
    );
  }

  const user = await adapter.getUser();
  if (!user) {
    await clearAccountLinkIntent();
    return NextResponse.redirect(
      new URL(appendAuthCallbackQuery(result.next, { error: "session_missing" }), origin),
    );
  }

  const finalize = finalizeAnonymousLink({
    linkIntentUserId,
    userId: user.id,
    isAnonymous: user.is_anonymous === true,
    hasGitHubProvider: getAccountProvider(user) === "github",
  });

  if (!finalize.ok) {
    if (finalize.code === "identity_conflict") {
      await adapter.signOut();
      if (linkIntentUserId) {
        await recordAccountLinkAttempt(linkIntentUserId, "conflict");
      }
    } else if (linkIntentUserId) {
      await recordAccountLinkAttempt(linkIntentUserId, "failed");
    }
    await clearAccountLinkIntent();
    return NextResponse.redirect(
      new URL(appendAuthCallbackQuery(result.next, { error: mapFinalizeCode(finalize.code) }), origin),
    );
  }

  if (user.is_anonymous !== true) {
    try {
      await ensureProfileForUser(supabase, user.id);
    } catch (error) {
      if (!(error instanceof ProfileAliasError)) throw error;
      if (linkIntentUserId) {
        await recordAccountLinkAttempt(linkIntentUserId, "failed");
      }
      await clearAccountLinkIntent();
      return NextResponse.redirect(
        new URL(appendAuthCallbackQuery(result.next, { error: "link_failed" }), origin),
      );
    }
  }

  if (linkIntentUserId) {
    await recordAccountLinkAttempt(linkIntentUserId, "linked");
  }
  await clearAccountLinkIntent();

  if (finalize.kind === "linked") {
    return NextResponse.redirect(
      new URL(appendAuthCallbackQuery(result.next, { linked: true }), origin),
    );
  }

  return NextResponse.redirect(
    new URL(appendAuthCallbackQuery(result.next, { signedIn: true }), origin),
  );
}
