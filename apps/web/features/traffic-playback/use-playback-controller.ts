"use client";

import type { Architecture } from "@faultline/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { buildSimGraph } from "./architecture-sim-graph";
import { createRouteLingers, mergeRouteLingers, pruneRouteLingers } from "./route-linger";
import type { SimComponent, SimConnection, SimPacket } from "./sim-types";
import { resetTickSimulationState, tickSimulation } from "./tick-simulation";
import type { PlaybackFrame, PlaybackSpeed, RouteLinger } from "./types";

export type PlaybackPhase = "idle" | "playing" | "paused";

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

  const phaseRef = useRef<PlaybackPhase>("idle");
  const speedRef = useRef<PlaybackSpeed>(1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const tickRef = useRef(0);

  const architectureRef = useRef<Architecture | null>(null);
  const simComponentsRef = useRef<SimComponent[]>([]);
  const simConnectionsRef = useRef<SimConnection[]>([]);
  const packetsRef = useRef<SimPacket[]>([]);
  const routeLingersRef = useRef<RouteLinger[]>([]);

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
    );
    simComponentsRef.current = result.components;
    simConnectionsRef.current = result.connections;
    packetsRef.current = result.packets;
    routeLingersRef.current = pruneRouteLingers(
      mergeRouteLingers(routeLingersRef.current, createRouteLingers(result.newRouteLingers)),
    );
    setFrame({
      packets: result.packets,
      edgeLoads: result.connections.map((connection) => ({
        connectionId: connection.id,
        weight: connection.load,
      })),
      componentVisuals: result.components.map((component) => ({
        componentId: component.id,
        processingCount: component.mechanismCount ?? component.processingPackets.length,
        armAngle: component.armAngle,
        passCount: component.passCount,
        state: component.state,
        cacheHitFlash: component.cacheHitFlash,
        writeBands: component.writeBands,
      })),
      routeLingers: routeLingersRef.current,
      tick: tickRef.current,
    });
  }, []);

  const loop = useCallback(
    (now: number) => {
      if (phaseRef.current !== "playing") return;

      const elapsed = now - lastFrameRef.current;
      if (elapsed > 14) {
        lastFrameRef.current = now;
        tickRef.current += 1;
        publishFromTick();
      }

      rafRef.current = requestAnimationFrame(loop);
    },
    [publishFromTick],
  );

  const startLoop = useCallback(() => {
    stopLoop();
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, stopLoop]);

  useEffect(() => () => stopLoop(), [stopLoop]);

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

  const start = useCallback(
    (architecture: Architecture) => {
      architectureRef.current = architecture;
      resetTickSimulationState();
      tickRef.current = 0;
      packetsRef.current = [];
      routeLingersRef.current = [];
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

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "paused";
    setPhase("paused");
    stopLoop();
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
      tickRef.current += 1;
      publishFromTick();
    },
    [publishFromTick, stopLoop],
  );

  const reset = useCallback(() => {
    stopLoop();
    architectureRef.current = null;
    simComponentsRef.current = [];
    simConnectionsRef.current = [];
    packetsRef.current = [];
    routeLingersRef.current = [];
    tickRef.current = 0;
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
    playbackRunning: phase !== "idle",
    playbackPaused: phase === "paused",
    playbackPlaying: phase === "playing",
    start,
    pause,
    resume,
    step,
    reset,
    setSpeed,
    syncArchitecture,
    markComponentFailed,
  };
}

export type { PlaybackSpeed } from "./types";
