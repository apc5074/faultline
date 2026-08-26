"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfigFromEnv } from "./config";

/** Browser Supabase client with cookie-backed session persistence. */
export function createSupabaseBrowserClient(): SupabaseClient {
  const config = getSupabasePublicConfigFromEnv();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }

  return createBrowserClient(config.url, config.publishableKey);
}
