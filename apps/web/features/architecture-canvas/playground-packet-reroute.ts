/** Stub for T-16 playback — U-turn in-flight packets when architecture changes mid-run. */
export type PacketRerouteRequest = {
  componentId: string;
  connectionIds: readonly string[];
};

export function notifyPacketReroute(_request: PacketRerouteRequest): void {
  // No-op until traffic playback lands in T-16.
}
