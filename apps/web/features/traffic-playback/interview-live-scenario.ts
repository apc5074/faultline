import { createPlaybackEvents, type AuthoritativePlaybackEvent, type PlaybackEvent } from "./presentation-events.ts";

export type InterviewLiveScenarioPhase = "idle" | "bursting" | "settled" | "cancelled";

export interface InterviewLiveScenarioState<TEvent extends AuthoritativePlaybackEvent = AuthoritativePlaybackEvent> {
  readonly phase: InterviewLiveScenarioPhase;
  readonly scenarioId: string | null;
  readonly evidenceRevision: string | null;
  readonly events: readonly PlaybackEvent<TEvent>[];
  readonly currentEvent: PlaybackEvent<TEvent> | null;
  readonly nextEventIndex: number;
  readonly failureComponentIds: readonly string[];
  readonly reducedMotion: boolean;
}

export interface InterviewLiveScenarioInput<TEvent extends AuthoritativePlaybackEvent> {
  readonly scenarioId: string;
  readonly evidenceRevision: string;
  readonly events: readonly TEvent[];
  readonly reducedMotion?: boolean;
}

const EMPTY: InterviewLiveScenarioState = {
  phase: "idle", scenarioId: null, evidenceRevision: null, events: [], currentEvent: null,
  nextEventIndex: 0, failureComponentIds: [], reducedMotion: false,
};

function failureIds<TEvent extends AuthoritativePlaybackEvent>(events: readonly PlaybackEvent<TEvent>[]): readonly string[] {
  return [...new Set(events.flatMap(({ event }) =>
    (event.type === "component_failed" || event.type === "component_saturated") && event.componentId
      ? [event.componentId]
      : []))].sort();
}

/** Prepare one fresh simulator result for the interview-only live presentation source. */
export function prepareInterviewLiveScenario<TEvent extends AuthoritativePlaybackEvent>(input: InterviewLiveScenarioInput<TEvent>): InterviewLiveScenarioState<TEvent> {
  if (!input.scenarioId.trim() || !input.evidenceRevision.trim()) throw new Error("Interview live scenarios require stable scenario and evidence revisions.");
  if (input.events.length === 0) throw new Error("Interview live scenarios require authoritative events.");
  const events = createPlaybackEvents({ runId: `interview-${input.scenarioId}-${input.evidenceRevision}`, source: "interview-live-scenario", events: input.events });
  const reducedMotion = input.reducedMotion === true;
  return {
    phase: reducedMotion ? "settled" : "bursting", scenarioId: input.scenarioId, evidenceRevision: input.evidenceRevision,
    events, currentEvent: reducedMotion ? events.at(-1) ?? null : null,
    nextEventIndex: reducedMotion ? events.length : 0, failureComponentIds: failureIds(events), reducedMotion,
  };
}

/** Expose exactly one authoritative event per tick; the source never invents traffic. */
export function advanceInterviewLiveScenario<TEvent extends AuthoritativePlaybackEvent>(state: InterviewLiveScenarioState<TEvent>): InterviewLiveScenarioState<TEvent> {
  if (state.phase !== "bursting") return state;
  const event = state.events[state.nextEventIndex];
  if (!event) return { ...state, phase: "settled" };
  const nextIndex = state.nextEventIndex + 1;
  return { ...state, currentEvent: event, nextEventIndex: nextIndex, phase: nextIndex >= state.events.length ? "settled" : "bursting" };
}

/** Replace a completed scenario only when the caller has fresh semantic evidence. */
export function replaceInterviewLiveScenario<TEvent extends AuthoritativePlaybackEvent>(state: InterviewLiveScenarioState<TEvent>, input: InterviewLiveScenarioInput<TEvent>): InterviewLiveScenarioState<TEvent> {
  if (input.evidenceRevision === state.evidenceRevision && input.scenarioId === state.scenarioId) return state;
  return prepareInterviewLiveScenario(input);
}

export function cancelInterviewLiveScenario<TEvent extends AuthoritativePlaybackEvent>(state: InterviewLiveScenarioState<TEvent>): InterviewLiveScenarioState<TEvent> {
  if (state.phase === "idle" || state.phase === "cancelled") return state;
  return { ...EMPTY, phase: "cancelled", reducedMotion: state.reducedMotion } as InterviewLiveScenarioState<TEvent>;
}
