import { NextResponse } from "next/server";

import { normalizeAuthCallbackRedirect } from "@/lib/auth/account-status";
import { createSupabaseAuthAdapter } from "@/lib/auth/auth-adapter";
import { recordAccountLinkAttempt } from "@/lib/auth/link-audit";
import { setAccountLinkIntent } from "@/lib/auth/link-session";
import { startGitHubOAuth } from "@/lib/auth/github-oauth";
import { buildOAuthCallbackUrl, getRequestOrigin } from "@/lib/auth/request-origin";
import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Explicit GitHub OAuth entry point. Never auto-invoked on page load. */
export async function GET(request: Request): Promise<Response> {
  const configured = getSupabasePublicConfig() !== null;
  const next = normalizeAuthCallbackRedirect(new URL(request.url).searchParams.get("next"));

  if (!configured) {
    return NextResponse.redirect(new URL(`/?auth_error=misconfigured`, request.url));
  }

  const origin = getRequestOrigin(request);
  if (!origin) {
    return NextResponse.redirect(new URL(`/?auth_error=misconfigured`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const adapter = createSupabaseAuthAdapter(supabase);
  const user = await adapter.getUser();

  if (user?.is_anonymous === true) {
    await setAccountLinkIntent(user.id);
    await recordAccountLinkAttempt(user.id, "started");
  }

  const callbackUrl = buildOAuthCallbackUrl(origin, next);
  const result = await startGitHubOAuth(adapter, { callbackUrl, next });

  if (!result.ok) {
    if (result.code === "already_signed_in") {
      return NextResponse.redirect(new URL(next, origin));
    }
    const errorCode = result.code === "oauth_start_failed" ? "link_failed" : result.code;
    return NextResponse.redirect(new URL(`${next}?auth_error=${errorCode}`, origin));
  }

  return NextResponse.redirect(result.redirectUrl);
}
