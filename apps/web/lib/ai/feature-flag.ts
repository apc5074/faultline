/**
 * Feature flag for embedded AI Engineer, help chips, annotations, and WebMCP.
 *
 * Set `NEXT_PUBLIC_FAULTLINE_AI_ENABLED=true` in local `.env` and Vercel
 * (Preview/Production). This is browser-safe config — not a secret. Leave unset
 * or false to hide AI UI and reject `/api/agent` without calling the gateway.
 */
export function isFaultlineAiEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_FAULTLINE_AI_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}
