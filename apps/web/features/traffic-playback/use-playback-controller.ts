"use client";

import type { Architecture } from "@faultline/core";
import type { SimulationEvent } from "@faultline/simulator";
import { useCallback, useEffect, useRef, useState } from "react";

import { runRamp01 } from "../architecture-canvas/run-timeline.ts";

import type { AuthoritativeTrafficPlan } from "./authoritative-edge-traffic";
import { buildSimGraph } from "./architecture-sim-graph";
import { createRouteLingers, mergeRouteLingers, pruneRouteLingers } from "./route-linger";
import type { SimComponent, SimConnection, SimPacket } from "./sim-types";
import { resetTickSimulationState, tickSimulation } from "./tick-simulation";
import type { PlaybackFrame, PlaybackSpeed, RouteLinger } from "./types";

export type PlaybackPhase = "idle" | "playing" | "paused" | "settling" | "settled";
/** Stillness after the rAF loop stops, before the verdict stamps in. */
export const SETTLING_MS = 700;

const EMPTY_FRAME: PlaybackFrame = {
  packets: [],
  edgeLoads: [],
  componentVisuals: [],
  routeLingers: [],
  tick: 0,
};

export function usePlaybackController() {
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [frame, setFrame] = useState<PlaybackFrame>(EMPTY_FRAME);
  const [timelineDurationMs, setTimelineDurationMs] = useState(0);

  const phaseRef = useRef<PlaybackPhase>("idle");
  const speedRef = useRef<PlaybackSpeed>(1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const tickRef = useRef(0);
  const remainingTimelineMsRef = useRef<number | null>(null);
  const timelineCompleteRef = useRef<(() => void) | null>(null);
  const timelineEventsRef = useRef<readonly { event: SimulationEvent; atMs: number }[]>([]);
  const timelineEventIndexRef = useRef(0);
  const timelineDurationRef = useRef(0);
  const timelineEventHandlerRef = useRef<((event: SimulationEvent) => void) | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineRampRef = useRef(1);
  const [runSeq, setRunSeq] = useState(0);

  const architectureRef = useRef<Architecture | null>(null);
  const simComponentsRef = useRef<SimComponent[]>([]);
  const simConnectionsRef = useRef<SimConnection[]>([]);
  const packetsRef = useRef<SimPacket[]>([]);
  const routeLingersRef = useRef<RouteLinger[]>([]);
  const volumeShareRef = useRef<ReadonlyMap<string, number> | null>(null);
  const authoritativeTrafficRef = useRef<AuthoritativeTrafficPlan | null>(null);

  phaseRef.current = phase;
  speedRef.current = speed;

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const publishFromTick = useCallback(() => {
    if (!architectureRef.current) {
      setFrame(EMPTY_FRAME);
      return;
    }
    const result = tickSimulation(
      simComponentsRef.current,
      simConnectionsRef.current,
      packetsRef.current,
      speedRef.current,
      tickRef.current,
      {
        volumeShareByComponentId: volumeShareRef.current ?? undefined,
        authoritativeTraffic: authoritativeTrafficRef.current ?? undefined,
      },
    );
    simComponentsRef.current = result.components;
    simConnectionsRef.current = result.connections;
    packetsRef.current = result.packets;
    routeLingersRef.current = pruneRouteLingers(
      mergeRouteLingers(routeLingersRef.current, createRouteLingers(result.newRouteLingers)),
    );
    const ramp = timelineRampRef.current;
    const timelineActive = remainingTimelineMsRef.current !== null;
    setFrame({
      packets: result.packets,
      edgeLoads: result.connections.map((connection) => ({
        connectionId: connection.id,
        weight: connection.load * ramp,
      })),
      componentVisuals: result.components.map((component) => ({
        componentId: component.id,
        processingCount: component.mechanismCount ?? component.processingPackets.length,
        armAngle: component.armAngle,
        passCount: component.passCount,
        state: component.state,
        cacheHitFlash: component.cacheHitFlash,
        processingSlotIndices: component.processingSlotIndices,
        rejectedCount: component.rejectedCount,
      })),
      routeLingers: routeLingersRef.current,
      tick: tickRef.current,
      timelineProgress01: timelineActive
          ? Math.min(1, Math.max(0, 1 - (remainingTimelineMsRef.current ?? 0) / Math.max(1, timelineDurationRef.current)))
          : undefined,
    });
  }, []);

  const loop = useCallback(
    (now: number) => {
      if (phaseRef.current !== "playing") return;

      const elapsed = now - lastFrameRef.current;
      if (elapsed > 14) {
        lastFrameRef.current = now;
        tickRef.current += 1;
        if (remainingTimelineMsRef.current !== null) {
          remainingTimelineMsRef.current -= elapsed * speedRef.current;
          const elapsedTimelineMs = timelineDurationRef.current - Math.max(0, remainingTimelineMsRef.current);
          timelineRampRef.current = runRamp01(elapsedTimelineMs, timelineDurationRef.current);
          while (timelineEventsRef.current[timelineEventIndexRef.current]?.atMs <= elapsedTimelineMs) {
            const event = timelineEventsRef.current[timelineEventIndexRef.current++];
            if (event) timelineEventHandlerRef.current?.(event.event);
          }
        }
        publishFromTick();
        if (remainingTimelineMsRef.current !== null && remainingTimelineMsRef.current <= 0) {
          remainingTimelineMsRef.current = null;
          timelineRampRef.current = 1;
          stopLoop();
          phaseRef.current = "settling";
          setPhase("settling");
          settleTimerRef.current = setTimeout(() => {
            phaseRef.current = "settled";
            setPhase("settled");
            settleTimerRef.current = null;
            const complete = timelineCompleteRef.current;
            timelineCompleteRef.current = null;
            complete?.();
          }, SETTLING_MS);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    },
    [publishFromTick, stopLoop],
  );

  const startLoop = useCallback(() => {
    stopLoop();
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, stopLoop]);

  useEffect(() => () => {
    stopLoop();
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, [stopLoop]);

  useEffect(() => {
    if (routeLingersRef.current.length === 0) return;
    let raf = 0;
    const prune = () => {
      const pruned = pruneRouteLingers(routeLingersRef.current);
      if (pruned.length !== routeLingersRef.current.length) {
        routeLingersRef.current = pruned;
        setFrame((current) => ({ ...current, routeLingers: pruned }));
      }
      if (pruned.length > 0) {
        raf = requestAnimationFrame(prune);
      }
    };
    raf = requestAnimationFrame(prune);
    return () => cancelAnimationFrame(raf);
  }, [frame.routeLingers.length]);

  const markComponentFailed = useCallback(
    (componentId: string) => {
      if (phaseRef.current === "idle") return;
      simComponentsRef.current = simComponentsRef.current.map((component) =>
        component.id === componentId ? { ...component, state: "failed" } : component,
      );
      publishFromTick();
    },
    [publishFromTick],
  );

  const setVolumeShares = useCallback((shares: ReadonlyMap<string, number> | null) => {
    volumeShareRef.current = shares;
  }, []);

  const setAuthoritativeTraffic = useCallback((plan: AuthoritativeTrafficPlan | null) => {
    const hadPlan = authoritativeTrafficRef.current !== null;
    authoritativeTrafficRef.current = plan;
    if (hadPlan !== (plan !== null)) {
      // Switching ambient ↔ authoritative clears in-flight theater packets.
      packetsRef.current = [];
      resetTickSimulationState();
    }
  }, []);

  const start = useCallback(
    (architecture: Architecture) => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
      architectureRef.current = architecture;
      resetTickSimulationState();
      tickRef.current = 0;
      timelineRampRef.current = remainingTimelineMsRef.current !== null ? 0 : 1;
      setRunSeq((seq) => seq + 1);
      packetsRef.current = [];
      routeLingersRef.current = [];
      volumeShareRef.current = null;
      // Keep authoritative plan across restart when Run evidence is still current.
      const graph = buildSimGraph(architecture);
      simComponentsRef.current = graph.components;
      simConnectionsRef.current = graph.connections;
      phaseRef.current = "playing";
      setPhase("playing");
      publishFromTick();
      startLoop();
    },
    [publishFromTick, startLoop],
  );

  /** Starts a finite presentation replay; `onComplete` fires after settling, when the verdict should land. */
  const startTimed = useCallback(
    (architecture: Architecture, durationMs: number, events: readonly { event: SimulationEvent; atMs: number }[], onComplete: () => void, onEvent?: (event: SimulationEvent) => void) => {
      const normalizedDurationMs = Math.max(1, durationMs);
      remainingTimelineMsRef.current = normalizedDurationMs;
      timelineDurationRef.current = normalizedDurationMs;
      setTimelineDurationMs(normalizedDurationMs);
      timelineEventsRef.current = events;
      timelineEventIndexRef.current = 0;
      timelineEventHandlerRef.current = onEvent ?? null;
      timelineCompleteRef.current = onComplete;
      start(architecture);
    },
    [start],
  );

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "paused";
    setPhase("paused");
    stopLoop();
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, [stopLoop]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    phaseRef.current = "playing";
    setPhase("playing");
    startLoop();
  }, [startLoop]);

  const step = useCallback(
    (architecture: Architecture) => {
      if (phaseRef.current === "idle") {
        architectureRef.current = architecture;
        resetTickSimulationState();
        tickRef.current = 0;
        packetsRef.current = [];
        routeLingersRef.current = [];
        const graph = buildSimGraph(architecture);
        simComponentsRef.current = graph.components;
        simConnectionsRef.current = graph.connections;
        phaseRef.current = "paused";
        setPhase("paused");
      } else {
        stopLoop();
        phaseRef.current = "paused";
        setPhase("paused");
      }

      // A timed run advances by simulator evidence, never by an arbitrary
      // animation frame. Events sharing a timestamp remain individually
      // inspectable in their simulator-defined order.
      if (remainingTimelineMsRef.current !== null) {
        const next = timelineEventsRef.current[timelineEventIndexRef.current];
        if (next) {
          const elapsedTimelineMs = Math.max(
            timelineDurationRef.current - remainingTimelineMsRef.current,
            next.atMs,
          );
          remainingTimelineMsRef.current = Math.max(0, timelineDurationRef.current - elapsedTimelineMs);
          timelineRampRef.current = runRamp01(elapsedTimelineMs, timelineDurationRef.current);
          timelineEventIndexRef.current += 1;
          timelineEventHandlerRef.current?.(next.event);
        }
      }
      tickRef.current += 1;
      publishFromTick();
    },
    [publishFromTick, stopLoop],
  );

  const reset = useCallback(() => {
    stopLoop();
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    architectureRef.current = null;
    simComponentsRef.current = [];
    simConnectionsRef.current = [];
    packetsRef.current = [];
    routeLingersRef.current = [];
    volumeShareRef.current = null;
    authoritativeTrafficRef.current = null;
    tickRef.current = 0;
    remainingTimelineMsRef.current = null;
    timelineCompleteRef.current = null;
    timelineEventsRef.current = [];
    timelineEventIndexRef.current = 0;
    timelineEventHandlerRef.current = null;
    timelineRampRef.current = 1;
    setTimelineDurationMs(0);
    resetTickSimulationState();
    phaseRef.current = "idle";
    setPhase("idle");
    setFrame(EMPTY_FRAME);
  }, [stopLoop]);

  const syncArchitecture = useCallback((architecture: Architecture) => {
    if (!architectureRef.current || phaseRef.current === "idle") return;
    architectureRef.current = architecture;
    const graph = buildSimGraph(architecture);
    simComponentsRef.current = graph.components;
    simConnectionsRef.current = graph.connections;
  }, []);

  return {
    phase,
    speed,
    frame,
    timelineDurationMs,
    runSeq,
    playbackRunning: phase === "playing" || phase === "paused" || phase === "settling",
    playbackPaused: phase === "paused",
    playbackPlaying: phase === "playing",
    start,
    startTimed,
    pause,
    resume,
    step,
    reset,
    setSpeed,
    syncArchitecture,
    markComponentFailed,
    setVolumeShares,
    setAuthoritativeTraffic,
  };
}

export type { PlaybackSpeed } from "./types";
