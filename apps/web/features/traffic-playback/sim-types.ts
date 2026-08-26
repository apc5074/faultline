import type { ComponentInstance } from "@faultline/core";

/** Glyph-aligned component types used by the Figma reference tick loop. */
export type SimComponentType =
  | "user"
  | "server"
  | "load_balancer"
  | "cache"
  | "sql_db"
  | "nosql_db"
  | "queue"
  | "pubsub"
  | "cdn"
  | "object_storage"
  | "api_gateway"
  | "dns";

export type SimComponentState = "idle" | "processing" | "overloaded" | "failed";

export type PacketShape = "request" | "response" | "write" | "event" | "rejected";

export interface SimPort {
  id: string;
}

export interface SimComponent {
  id: string;
  type: SimComponentType;
  state: SimComponentState;
  instances: number;
  capacity: number;
  depth: number;
  replicas: number;
  algorithm: "round-robin" | "least-connections";
  inputPorts: SimPort[];
  outputPorts: SimPort[];
  processingPackets: string[];
  armAngle?: number;
  passCount?: number;
  cacheHitFlash?: boolean;
  writeBands?: number;
  mechanismCount?: number;
}

export interface SimConnection {
  id: string;
  fromComponentId: string;
  fromPortId: string;
  toComponentId: string;
  toPortId: string;
  load: number;
}

export interface SimPacket {
  id: string;
  shape: PacketShape;
  connectionId: string;
  progress: number;
  reverse?: boolean;
  dwellComponentId?: string;
  dwellProgress?: number;
  /** Connections traversed this round trip — used for route linger ghosts. */
  trailConnectionIds?: string[];
}

export interface SimTickResult {
  components: SimComponent[];
  connections: SimConnection[];
  packets: SimPacket[];
  /** Connection ids that completed a round trip this tick. */
  newRouteLingers: string[];
}

export function catalogTypeToSimType(type: ComponentInstance["type"]): SimComponentType | null {
  switch (type) {
    case "traffic-source":
      return "user";
    case "service":
      return "server";
    case "postgres":
      return "sql_db";
    case "redis":
      return "cache";
    case "load-balancer":
      return "load_balancer";
    case "cdn":
      return "cdn";
    case "global-router":
      return "api_gateway";
    default:
      return null;
  }
}
