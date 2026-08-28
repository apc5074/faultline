import type { GeographicTrafficShare } from "./challenge.js";

/** The kind of demand represented by one challenge-owned workload channel. */
export type WorkloadChannelKind = "request" | "object_io" | "async_work";

/**
 * A named demand stream for levels with more than one meaningful path.
 * Rates and operation quantities are challenge inputs, not UI telemetry.
 */
export interface WorkloadChannel {
  /** Stable identifier such as `upload` or `playback_start`. */
  id: string;
  kind: WorkloadChannelKind;
  ratePerSecond: number;
  /** Bytes transferred by one operation, when this channel carries objects. */
  bytesPerOperation?: number;
  /** Processing work required by one operation, when this channel is async work. */
  workUnitsPerOperation?: number;
  /** Optional per-channel origin distribution; otherwise the challenge default applies. */
  geographicDistribution?: readonly GeographicTrafficShare[];
  /** Optional concentrated share of this channel (0..1). */
  hotShare?: number;
}
