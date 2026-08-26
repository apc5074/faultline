import type { WebMcpModelContext } from "./types.js";

/** Feature-detect the draft browser WebMCP API without user-agent sniffing. */
export function getWebMcpModelContext(): WebMcpModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  return (document as Document & { modelContext?: WebMcpModelContext }).modelContext;
}
