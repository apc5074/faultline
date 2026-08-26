"use client";

import type { Architecture } from "@faultline/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { buildSimGraph } from "./architecture-sim-graph";
import type { SimComponent, SimConnection, SimPacket } from "./sim-types";
import { resetTickSimulationState, tickSimulation } from "./tick-simulation";
import type { PlaybackFrame, PlaybackSpeed } from "./types";

export type PlaybackPhase = "idle" | "playing" | "paused";

const EMPTY_FRAME: PlaybackFrame = {
  packets: [],
  edgeLoads: [],
  componentVisuals: [],
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
    setFrame({
      packets: result.packets,
      edgeLoads: result.connections.map((connection) => ({
        connectionId: connection.id,
        weight: connection.load,
      })),
      componentVisuals: result.components.map((component) => ({
        componentId: component.id,
        processingCount: component.processingPackets.length,
        armAngle: component.armAngle,
        passCount: component.passCount,
        state: component.state,
      })),
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

  const start = useCallback(
    (architecture: Architecture) => {
      architectureRef.current = architecture;
      resetTickSimulationState();
      tickRef.current = 0;
      packetsRef.current = [];
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
  };
}

export type { PlaybackSpeed } from "./types";
