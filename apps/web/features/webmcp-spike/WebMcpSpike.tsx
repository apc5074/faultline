"use client";

import { useEffect, useState } from "react";

type ModelContextTool = {
  description: string;
  execute: () => { app: "faultline"; phase: 0; status: "online" };
  inputSchema: { properties: Record<string, never>; type: "object" };
  name: "get_faultline_status";
};

type ModelContext = {
  registerTool: (tool: ModelContextTool, options: { signal: AbortSignal }) => Promise<void>;
};

export function WebMcpSpike() {
  const [lastInvocation, setLastInvocation] = useState<string | null>(null);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;

    if (!modelContext) {
      return;
    }

    const controller = new AbortController();

    void modelContext
      .registerTool(
        {
          description: "Return the current Faultline Phase 0 shell status.",
          execute: () => {
            setLastInvocation(new Date().toLocaleTimeString());

            return { app: "faultline", phase: 0, status: "online" };
          },
          inputSchema: { properties: {}, type: "object" },
          name: "get_faultline_status",
        },
        { signal: controller.signal },
      )
      .catch(() => {
        // WebMCP is optional; a rejected experimental registration must not affect the shell.
      });

    return () => controller.abort();
  }, []);

  if (!lastInvocation) {
    return null;
  }

  return <p className="webmcp-status">WebMCP status checked at {lastInvocation}.</p>;
}
