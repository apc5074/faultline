import { notFound } from "next/navigation";

import { WebMcpInspector } from "@/features/webmcp-inspector/WebMcpInspector";

// This page is development-only. Prevent Next from prerendering the notFound
// branch into a production build artifact that can remain stale when switching
// servers.
export const dynamic = "force-dynamic";

export default function DevWebMcpPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <WebMcpInspector />;
}
