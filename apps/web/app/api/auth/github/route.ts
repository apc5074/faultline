import { NextResponse } from "next/server";

import { normalizeAuthCallbackRedirect } from "@/lib/auth/account-status";
import { createSupabaseAuthAdapter } from "@/lib/auth/auth-adapter";
import { recordAccountLinkAttempt } from "@/lib/auth/link-audit";
import { clearAccountLinkIntent, setAccountLinkIntent } from "@/lib/auth/link-session";
import { startGitHubOAuth } from "@/lib/auth/github-oauth";
import { buildOAuthCallbackUrl, getRequestOrigin } from "@/lib/auth/request-origin";
import { createSupabaseServerClient, getSupabasePublicConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Explicit GitHub OAuth entry point. Never auto-invoked on page load. */
export async function GET(request: Request): Promise<Response> {
  const configured = getSupabasePublicConfig() !== null;
  const requestUrl = new URL(request.url);
  const next = normalizeAuthCallbackRedirect(requestUrl.searchParams.get("next"));
  const mode = requestUrl.searchParams.get("mode") === "signin" ? "signin" : "link";

  if (!configured) {
    return NextResponse.redirect(new URL(`/?auth_error=misconfigured`, request.url));
  }

  const origin = getRequestOrigin(request);
  if (!origin) {
    return NextResponse.redirect(new URL(`/?auth_error=misconfigured`, request.url));
  }

  const response = new NextResponse(null, { status: 302 });
  const supabase = await createSupabaseServerClient(undefined, response);
  const adapter = createSupabaseAuthAdapter(supabase);
  const user = await adapter.getUser();

  // A normal sign-in must not inherit a stale anonymous-link intent from a
  // previous failed linking attempt, or the callback could reject the
  // returning permanent user as an identity conflict.
  if (mode === "signin") await clearAccountLinkIntent();

  if (user?.is_anonymous === true && mode === "link") {
    await setAccountLinkIntent(user.id);
    await recordAccountLinkAttempt(user.id, "started");
  }

  const callbackUrl = buildOAuthCallbackUrl(origin, next);
  const result = await startGitHubOAuth(adapter, { callbackUrl, next, currentUser: user, mode });

  if (!result.ok) {
    if (result.code === "already_signed_in") {
      response.headers.set("Location", new URL(next, origin).toString());
      return response;
    }
    const errorCode = result.code === "oauth_start_failed" ? "link_failed" : result.code;
    response.headers.set("Location", new URL(`${next}?auth_error=${errorCode}`, origin).toString());
    return response;
  }

  response.headers.set("Location", result.redirectUrl);
  return response;
}
