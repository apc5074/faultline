import type { ExperimentResult } from "@faultline/core";

import { createPlaybackEvents, type PlaybackEvent } from "@/features/traffic-playback";

export interface PublishedExperimentResult {
  readonly result: ExperimentResult;
  readonly events: readonly PlaybackEvent[];
}

/** Shared browser boundary for experiment results from AI, WebMCP, and dev fixtures. */
export function publishExperimentResult(
  result: ExperimentResult,
  onPublished: (published: PublishedExperimentResult) => void,
): void {
  onPublished({
    result,
    events: createPlaybackEvents({
      runId: `experiment-${result.type}-${result.simulatorVersion}-${result.events.length}`,
      source: "experiment",
      events: result.events,
    }),
  });
}
