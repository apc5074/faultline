/** Resolves the public site origin from an incoming request (Vercel-safe). */
export function getRequestOrigin(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return null;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = forwardedProto ?? (isLocal ? "http" : "https");

  if (protocol !== "http" && protocol !== "https") return null;
  if (protocol === "http" && !isLocal) return null;

  return `${protocol}://${host}`;
}

/** Builds the OAuth callback URL on the same origin as the incoming request. */
export function buildOAuthCallbackUrl(origin: string, nextPath: string): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}
