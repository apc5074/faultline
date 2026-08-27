import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** Returns Vercel's trusted client IP header, never a user-provided fallback in production. */
export function getTrustedClientAddress(headers: Headers, production: boolean): string | null {
  const fromVercel = headers.get("x-vercel-forwarded-for")?.trim();
  if (fromVercel && isIP(fromVercel) !== 0) return fromVercel;

  // Vercel overwrites this header on direct deployments. Keep the fallback only
  // for local development, where the Vercel-specific header is unavailable.
  if (!production) {
    const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
    if (forwarded && isIP(forwarded) !== 0) return forwarded;
    return "local-development";
  }

  return null;
}

/** Derive a stable opaque UUID from a client address without storing the address itself. */
export function deriveNetworkUsageKey(clientAddress: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(`faultline-agent-network-v1:${clientAddress}`).digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
