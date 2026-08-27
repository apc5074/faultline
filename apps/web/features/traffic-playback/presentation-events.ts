/**
 * UI-only envelope around simulator evidence.
 *
 * The event itself stays untouched: the envelope only identifies its visual run,
 * its source, and its original position. This module deliberately has no React,
 * simulator, architecture, or timer dependency so baseline and Phase 8 publishers
 * can share it when their result paths are ready.
 */

export type PlaybackEventSource = "baseline" | "experiment";

/** Structural contract shared by SimulationEvent and ExperimentEvent. */
export interface AuthoritativePlaybackEvent {
  type: string;
  connectionId?: string;
  componentId?: string;
  data: Readonly<Record<string, number | string>>;
}

export interface PlaybackEvent<TEvent extends AuthoritativePlaybackEvent = AuthoritativePlaybackEvent> {
  runId: string;
  /** Zero-based position in the authoritative event batch. */
  sequence: number;
  source: PlaybackEventSource;
  /** The original event object; presentation code must not alter its evidence. */
  event: TEvent;
}

export interface CreatePlaybackEventsInput<TEvent extends AuthoritativePlaybackEvent> {
  runId: string;
  source: PlaybackEventSource;
  events: readonly TEvent[];
  /** Allows a future combined batch to continue its authoritative sequence. */
  startSequence?: number;
}

/**
 * Adds presentation identity while preserving authoritative event order and data.
 * This is intentionally not an event scheduler: it does not sort, filter, infer,
 * or manufacture simulator facts.
 */
export function createPlaybackEvents<TEvent extends AuthoritativePlaybackEvent>({
  runId,
  source,
  events,
  startSequence = 0,
}: CreatePlaybackEventsInput<TEvent>): readonly PlaybackEvent<TEvent>[] {
  if (runId.trim().length === 0) {
    throw new Error("Playback events require a non-empty runId.");
  }
  if (!Number.isSafeInteger(startSequence) || startSequence < 0) {
    throw new Error("Playback event startSequence must be a non-negative safe integer.");
  }

  return events.map((event, index) => ({
    runId,
    sequence: startSequence + index,
    source,
    event,
  }));
}
