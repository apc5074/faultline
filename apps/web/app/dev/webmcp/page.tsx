import { notFound } from "next/navigation";

import { WebMcpInspector } from "@/features/webmcp-inspector/WebMcpInspector";

export default function DevWebMcpPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <WebMcpInspector />;
}
