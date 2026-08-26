import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabasePublicConfig = {
  publishableKey: string;
  url: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? readFlattenedLocalEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    readFlattenedLocalEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    readFlattenedLocalEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !publishableKey) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return { publishableKey, url };
}

export function createSupabaseServerClient(
  config: SupabasePublicConfig = requireSupabasePublicConfig(),
): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAuthHealthUrl(config: SupabasePublicConfig): string {
  return new URL("auth/v1/health", `${config.url}/`).toString();
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
