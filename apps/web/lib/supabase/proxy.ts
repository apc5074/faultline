import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfigFromEnv } from "./config";

/**
 * Refreshes the Supabase auth session cookies on navigation.
 * Does not gate gameplay — unauthenticated visitors pass through.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const requiresAuthRefresh =
    path === "/account" ||
    path === "/level/1" ||
    path.startsWith("/api/") ||
    path.startsWith("/auth/");

  // Public pages do not need a refreshed session to render. Avoid making a
  // Supabase network request on every home/share navigation; authenticated
  // callers still refresh immediately before account, gameplay, API, and OAuth
  // work where cookies affect the result.
  if (!requiresAuthRefresh) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const config = getSupabasePublicConfigFromEnv();
  if (!config) {
    return response;
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touches Auth so expired sessions refresh before Server Components run.
  await supabase.auth.getUser();

  return response;
}
