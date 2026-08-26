"use client";

import { Handle, type HandleProps } from "@xyflow/react";

type PlaygroundHandleProps = HandleProps & {
  connected: boolean;
  failed: boolean;
};

export function PlaygroundHandle({ connected, failed, className, style, ...props }: PlaygroundHandleProps) {
  const classes = [
    "playground-handle",
    connected ? "playground-handle--connected" : "",
    failed ? "playground-handle--failed" : "",
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
