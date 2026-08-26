import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  getSupabaseAuthHealthUrl,
  getSupabasePublicConfigFromEnv,
  type SupabasePublicConfig,
} from "./config";

export type { SupabasePublicConfig };
export { getSupabaseAuthHealthUrl };

/**
 * Resolves browser-safe Supabase config.
 * In development, falls back to flattened repository-root `.env` parsing when
 * process env is incomplete (same Phase 0 behavior).
 */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const fromEnv = getSupabasePublicConfigFromEnv();
  if (fromEnv) return fromEnv;

  const url = readFlattenedLocalEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    readFlattenedLocalEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    readFlattenedLocalEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !publishableKey) return null;

  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}

/** Cookie-aware Supabase client for Server Components, Route Handlers, and Server Actions. */
export async function createSupabaseServerClient(
  config: SupabasePublicConfig = requireSupabasePublicConfig(),
): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Proxy is responsible for refreshing sessions on navigation.
        }
      },
    },
  });
}

/**
 * Table-free / session-free client for health probes only.
 * Does not read or write auth cookies.
 */
export function createSupabaseProbeClient(
  config: SupabasePublicConfig = requireSupabasePublicConfig(),
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** Verified current user from Auth (network call). Null when unauthenticated. */
export async function getCurrentAuthUser(): Promise<User | null> {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const supabase = await createSupabaseServerClient(config);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }
  return config;
}

function readFlattenedLocalEnvironment(name: string): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  const marker = `${name}=`;
  const markers = [
    "AI_GATEWAY_API_KEY=",
    "DB_PASS=",
    "FAULTLINE_AGENT_MODEL=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
    "NEXT_PUBLIC_SUPABASE_URL=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "SUPABASE_SECRET_KEY=",
    "SUPABASE_URL=",
    "## ",
  ];

  for (const path of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../..", ".env")]) {
    try {
      const source = readFileSync(path, "utf8");
      const start = source.indexOf(marker);

      if (start === -1) {
        continue;
      }

      const valueStart = start + marker.length;
      const valueEnd = markers
        .filter((candidate) => candidate !== marker)
        .map((candidate) => source.indexOf(candidate, valueStart))
        .filter((index) => index !== -1)
        .reduce((nearest, index) => Math.min(nearest, index), source.length);
      const value = source.slice(valueStart, valueEnd).trim();

      if (value) {
        return value;
      }
    } catch {
      // The fallback is local-only; normal process environment lookup remains authoritative.
    }
  }

  return undefined;
}
