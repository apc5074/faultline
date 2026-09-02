export { PlaybackPacketLayer } from "./PlaybackPacketLayer";
export { RouteLingerLayer } from "./RouteLingerLayer";
export { createRouteLingers, mergeRouteLingers, pruneRouteLingers, ROUTE_LINGER_MS } from "./route-linger";
export { mechanismPropsFromPlayback, glyphStateFromPlayback, playbackGlyphState } from "./playback-mechanism";
export type { PlaybackMechanismProps } from "./playback-mechanism";
export { buildSimGraph, mergeSimVisuals } from "./architecture-sim-graph";
export { pointOnOrthogonalPath } from "./path-geometry";
export { PlaybackPacketGlyph } from "./PlaybackPacketGlyph";
export { impactSlotSeed, randomizedImpactSlots } from "./impact-slots";
export type { ImpactSlotSeed } from "./impact-slots";
export { createPlaybackEvents } from "./presentation-events";
export type {
  AuthoritativePlaybackEvent,
  CreatePlaybackEventsInput,
  PlaybackEvent,
  PlaybackEventSource,
} from "./presentation-events";
export {
  advancePresentationPlayback,
  cancelPresentationPlayback,
  createPresentationPlaybackState,
  preparePresentationPlayback,
  settlePresentationPlayback,
  startPresentationPlayback,
} from "./presentation-playback";
export type { PresentationPlaybackPhase, PresentationPlaybackState } from "./presentation-playback";
export { prepareInterviewLiveScenario, advanceInterviewLiveScenario, replaceInterviewLiveScenario, cancelInterviewLiveScenario, type InterviewLiveScenarioState, type InterviewLiveScenarioInput, type InterviewLiveScenarioPhase } from "./interview-live-scenario";
export { catalogTypeToSimType } from "./sim-types";
export type { SimComponent, SimConnection, SimPacket } from "./sim-types";
export { resetTickSimulationState, tickSimulation, MAX_VISIBLE_REJECTED_PER_COMPONENT } from "./tick-simulation";
export type { TickSimulationOptions } from "./tick-simulation";
export {
  advanceAuthoritativeSpawns,
  AUTHORITATIVE_FULL_RPS_INTERVAL_TICKS,
  AUTHORITATIVE_MAX_PACKETS,
  AUTHORITATIVE_MAX_SPAWNS_PER_TICK,
  AUTHORITATIVE_WRITE_RESERVED,
  edgeRatesFromTrafficEvents,
  spawnAccrualPerTick,
  totalRps,
} from "./authoritative-edge-traffic";
export type {
  AuthoritativeEdgeRate,
  AuthoritativeSpawn,
  AuthoritativeTrafficPlan,
  TrafficRoutedLike,
} from "./authoritative-edge-traffic";
export type {
  ComponentPlaybackVisual,
  EdgeLoad,
  PacketShape,
  PlaybackFrame,
  PlaybackPacket,
  RouteLinger,
} from "./types";
export { buildComponentPlaybackVisuals, type PlaybackVisualContext } from "./playback-component-visuals";
export { selectComponentVisualEvidence } from "./component-visual-evidence";
export type { ComponentVisualEvidence, ComponentVisualEvidenceInput } from "./component-visual-evidence";
export {
  buildComponentVolumeShares,
  edgePlaybackWeightFromRps,
  mechanismCellsFromShare,
  share01FromAbsorb,
  visualLoadFromShare,
  VOLUME_SHARE_IDLE_EPSILON,
} from "./volume-share-visuals";
export type { ComponentVolumeShare, BuildVolumeSharesInput } from "./volume-share-visuals";
export { usePlaybackController, SETTLING_MS, type PlaybackPhase } from "./use-playback-controller";
