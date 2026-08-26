"use client";

import { Handle, type HandleProps } from "@xyflow/react";

import type { HandleConnectHint } from "@/features/architecture-canvas/playground-connect-hints";

type PlaygroundHandleProps = HandleProps & {
  connected: boolean;
  failed: boolean;
  connectHint?: HandleConnectHint;
  portsHidden?: boolean;
};

export function PlaygroundHandle({
  connected,
  failed,
  connectHint = "none",
  portsHidden = false,
  className,
  style,
  ...props
}: PlaygroundHandleProps) {
  const classes = [
    "playground-handle",
    connected ? "playground-handle--connected" : "",
    failed ? "playground-handle--failed" : "",
    connectHint === "source" ? "playground-handle--connect-source" : "",
    connectHint === "compatible" ? "playground-handle--compatible-target" : "",
    connectHint === "incompatible" ? "playground-handle--incompatible-target" : "",
    portsHidden ? "playground-handle--hidden" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const topValue = style?.top;
  const top =
    typeof topValue === "number" && Number.isFinite(topValue)
      ? `${topValue}px`
      : typeof topValue === "string" && topValue.length > 0
        ? topValue
        : "50%";

  return <Handle {...props} className={classes} style={{ ...style, top }} />;
}
