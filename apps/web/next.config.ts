import { loadEnvConfig } from "@next/env";

const { combinedEnv } = loadEnvConfig(new URL("../..", import.meta.url).pathname);

const browserSafeEnv: Record<string, string> = {};

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_ANON_KEY: combinedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: combinedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: combinedEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: combinedEnv.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN,
})) {
  if (value) {
    browserSafeEnv[name] = value;
  }
}

export default { env: browserSafeEnv };
