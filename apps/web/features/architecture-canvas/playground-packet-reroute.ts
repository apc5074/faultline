/** Packet reroute when architecture changes mid-playback (T-18). */
export type PacketRerouteRequest = {
  componentId: string;
  connectionIds: readonly string[];
};

type PacketRerouteHandler = (request: PacketRerouteRequest) => void;

let rerouteHandler: PacketRerouteHandler | null = null;

export function registerPacketRerouteHandler(handler: PacketRerouteHandler | null): void {
  rerouteHandler = handler;
}

export function notifyPacketReroute(request: PacketRerouteRequest): void {
  rerouteHandler?.(request);
}
