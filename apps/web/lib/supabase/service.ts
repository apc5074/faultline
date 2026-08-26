import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfigFromEnv, type SupabasePublicConfig } from "./config";

/**
 * Service-role client for privileged writes (seed/publish).
 * Never expose this client or key to the browser.
 */
export function createSupabaseServiceClient(
  config: SupabasePublicConfig = requirePublicConfig(),
): SupabaseClient {
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function requirePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfigFromEnv();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }
  return config;
}
