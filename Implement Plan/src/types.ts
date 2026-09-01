export type ComponentType =
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
  | "dns"
  | "user";

export type ComponentState = "idle" | "selected" | "processing" | "overloaded" | "failed";

export type PacketShape = "request" | "response" | "write" | "event" | "rejected";

export interface Port {
  id: string;
  side: "left" | "right";
  index: number;
  connected: boolean;
  failed?: boolean;
}

export interface DesignComponent {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  name: string;
  state: ComponentState;
  instances?: number;
  capacity?: number;
  depth?: number;
  replicas?: number;
  algorithm?: "round-robin" | "least-connections";
  inputPorts: Port[];
  outputPorts: Port[];
  stats: {
    rps: number;
    latency: number;
    hitRate?: number;
    queueDepth?: number;
  };
  processingPackets: string[];
  armAngle?: number; // load balancer pointer, -30 to 30 degrees
  passCount?: number; // CDN: total inbound passes, used to replay the node ripple
}

export interface Connection {
  id: string;
  fromComponentId: string;
  fromPortId: string;
  toComponentId: string;
  toPortId: string;
  load: number; // 0-1
}

export interface Packet {
  id: string;
  shape: PacketShape;
  connectionId: string;
  progress: number; // 0-1
  reverse?: boolean; // responses retrace the edge from target back to source
  dwellComponentId?: string;
  dwellProgress?: number; // 0-1 while inside component
}

export interface SimState {
  running: boolean;
  paused: boolean;
  speed: 0.5 | 1 | 2;
  tick: number;
}
