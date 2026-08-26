import type { ComponentInstance } from "@faultline/core";

export type ConnectingFrom = {
  nodeId: string;
  handleId: string;
  handleType: "source" | "target";
};

export type HandleConnectHint = "none" | "source" | "compatible" | "incompatible";

type FlowConnectionLike = {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
};

export function flowConnectionForHandles(
  from: ConnectingFrom,
  toNodeId: string,
  toHandleId: string,
): FlowConnectionLike {
  if (from.handleType === "source") {
    return {
      source: from.nodeId,
      sourceHandle: from.handleId,
      target: toNodeId,
      targetHandle: toHandleId,
    };
  }
  return {
    source: toNodeId,
    sourceHandle: toHandleId,
    target: from.nodeId,
    targetHandle: from.handleId,
  };
}

export function connectHintForPort(
  connectingFrom: ConnectingFrom | null,
  componentId: string,
  portId: string,
  portDirection: "input" | "output",
  components: readonly ComponentInstance[],
  isValidConnection: (connection: FlowConnectionLike) => boolean,
): HandleConnectHint {
  if (!connectingFrom) return "none";
  if (connectingFrom.nodeId === componentId && connectingFrom.handleId === portId) {
    return "source";
  }

  const handleType = portDirection === "input" ? "target" : "source";
  if (connectingFrom.handleType === "source" && handleType !== "target") return "incompatible";
  if (connectingFrom.handleType === "target" && handleType !== "source") return "incompatible";

  const draft = flowConnectionForHandles(connectingFrom, componentId, portId);
  return isValidConnection(draft) ? "compatible" : "incompatible";
}

export function nodeHasCompatiblePort(
  connectingFrom: ConnectingFrom | null,
  componentId: string,
  portIds: readonly { id: string; direction: "input" | "output" }[],
  components: readonly ComponentInstance[],
  isValidConnection: (connection: FlowConnectionLike) => boolean,
): boolean {
  if (!connectingFrom) return true;
  return portIds.some(
    (port) =>
      connectHintForPort(connectingFrom, componentId, port.id, port.direction, components, isValidConnection) ===
      "compatible",
  );
}
