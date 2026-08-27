import { notFound } from "next/navigation";

import { WebMcpInspector } from "@/features/webmcp-inspector/WebMcpInspector";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

export default function DevWebMcpPage() {
  if (process.env.NODE_ENV === "production" || !isFaultlineAiEnabled()) {
    notFound();
  }

  return <WebMcpInspector />;
}
