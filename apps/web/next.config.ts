import { loadEnvConfig } from "@next/env";

const { combinedEnv } = loadEnvConfig(new URL("../..", import.meta.url).pathname);

const browserSafeEnv: Record<string, string> = {};

const isDevelopment = combinedEnv.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS: combinedEnv.NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: combinedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: combinedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: combinedEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: combinedEnv.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN,
})) {
  if (value) {
    browserSafeEnv[name] = value;
  }
}

export default {
  env: browserSafeEnv,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
