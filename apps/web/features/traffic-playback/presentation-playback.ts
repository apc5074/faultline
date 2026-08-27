import type { AuthoritativePlaybackEvent, PlaybackEvent, PlaybackEventSource } from "./presentation-events";

/** Ephemeral state only; never becomes part of Architecture or simulator input. */
export type PresentationPlaybackPhase = "idle" | "preparing" | "playing" | "settled" | "cancelled";

export interface PresentationPlaybackState<TEvent extends AuthoritativePlaybackEvent = AuthoritativePlaybackEvent> {
  phase: PresentationPlaybackPhase;
  runId: string | null;
  source: PlaybackEventSource | null;
  events: readonly PlaybackEvent<TEvent>[];
  /** The event most recently made available to presentation selectors. */
  currentEvent: PlaybackEvent<TEvent> | null;
  /** Index of the next authoritative event to expose. */
  nextEventIndex: number;
}

const EMPTY_PLAYBACK_STATE: PresentationPlaybackState = {
  phase: "idle",
  runId: null,
  source: null,
  events: [],
  currentEvent: null,
  nextEventIndex: 0,
};

export function createPresentationPlaybackState(): PresentationPlaybackState {
  return EMPTY_PLAYBACK_STATE;
}

/**
 * Validates one immutable authoritative run before a scheduler begins playback.
 * Ordering belongs to simulator evidence; this function only rejects malformed
 * mixed/stale batches rather than sorting or repairing them.
 */
export function preparePresentationPlayback<TEvent extends AuthoritativePlaybackEvent>(
  events: readonly PlaybackEvent<TEvent>[],
): PresentationPlaybackState<TEvent> {
  if (events.length === 0) {
    throw new Error("Presentation playback requires at least one authoritative event.");
  }

  const first = events[0];
  let previousSequence = first.sequence - 1;
  for (const event of events) {
    if (event.runId !== first.runId || event.source !== first.source) {
      throw new Error("Presentation playback batch must contain one run and source.");
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= previousSequence) {
      throw new Error("Presentation playback events must have strictly increasing sequences.");
    }
    previousSequence = event.sequence;
  }

  return {
    phase: "preparing",
    runId: first.runId,
    source: first.source,
    events: [...events],
    currentEvent: null,
    nextEventIndex: 0,
  };
}

/** Begins a prepared run. Scheduling duration remains the caller's responsibility. */
export function startPresentationPlayback<TEvent extends AuthoritativePlaybackEvent>(
  state: PresentationPlaybackState<TEvent>,
): PresentationPlaybackState<TEvent> {
  if (state.phase !== "preparing") return state;
  return { ...state, phase: "playing" };
}

/** Exposes exactly the next authoritative event; it never manufactures a visual fact. */
export function advancePresentationPlayback<TEvent extends AuthoritativePlaybackEvent>(
  state: PresentationPlaybackState<TEvent>,
): PresentationPlaybackState<TEvent> {
  if (state.phase !== "playing") return state;

  const event = state.events[state.nextEventIndex];
  if (!event) {
    return { ...state, phase: "settled" };
  }

  return {
    ...state,
    currentEvent: event,
    nextEventIndex: state.nextEventIndex + 1,
  };
}

/** Settling retains the final event so visual surfaces can show factual end state. */
export function settlePresentationPlayback<TEvent extends AuthoritativePlaybackEvent>(
  state: PresentationPlaybackState<TEvent>,
): PresentationPlaybackState<TEvent> {
  if (state.phase === "idle" || state.phase === "cancelled") return state;
  return {
    ...state,
    phase: "settled",
    currentEvent: state.events.at(-1) ?? state.currentEvent,
    nextEventIndex: state.events.length,
  };
}

/** Cancelling clears active evidence so a stale timer cannot affect a replacement run. */
export function cancelPresentationPlayback<TEvent extends AuthoritativePlaybackEvent>(
  state: PresentationPlaybackState<TEvent>,
): PresentationPlaybackState<TEvent> {
  if (state.phase === "idle" || state.phase === "cancelled") return state;
  return {
    phase: "cancelled",
    runId: state.runId,
    source: state.source,
    events: [],
    currentEvent: null,
    nextEventIndex: 0,
  };
}
