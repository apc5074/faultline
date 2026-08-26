/**
 * Browser-safe Supabase public configuration.
 * Shared by health probes, browser clients, and cookie-aware server clients.
 */

export type SupabasePublicConfig = {
  publishableKey: string;
  url: string;
};

export function getSupabasePublicConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabasePublicConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

export function getSupabaseAuthHealthUrl(config: SupabasePublicConfig): string {
  return new URL("auth/v1/health", `${config.url}/`).toString();
}
