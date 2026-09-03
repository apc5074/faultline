"use client";

import {
  assertChallengeDefinition,
  getLevelCurriculum,
  getLevelStarterArchitecture,
  resolvePlayableChallenge,
} from "@faultline/challenges";
import type { ChallengeDefinition } from "@faultline/core";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const FALLBACK_SLUG = "url-shortener";
const fallbackChallenge = resolvePlayableChallenge(FALLBACK_SLUG);

export type PlaygroundChallengeSource = "daily" | "fallback";
export interface PlaygroundChallengeValue {
  challenge: ChallengeDefinition;
  curriculum: ReturnType<typeof getLevelCurriculum>;
  starterArchitecture: ReturnType<typeof getLevelStarterArchitecture>;
  source: PlaygroundChallengeSource;
  dailyMeta?: { dailyChallengeId: string; startsAt: string; endsAt: string; configHash: string; simulatorVersion: string };
}

const fallbackValue: PlaygroundChallengeValue = {
  challenge: fallbackChallenge,
  curriculum: getLevelCurriculum(FALLBACK_SLUG),
  starterArchitecture: getLevelStarterArchitecture(FALLBACK_SLUG),
  source: "fallback",
};
const PlaygroundChallengeContext = createContext<PlaygroundChallengeValue | null>(null);

function valueForChallenge(challenge: ChallengeDefinition, source: PlaygroundChallengeSource, dailyMeta?: PlaygroundChallengeValue["dailyMeta"]): PlaygroundChallengeValue {
  return { challenge, curriculum: getLevelCurriculum(challenge.slug), starterArchitecture: getLevelStarterArchitecture(challenge.slug), source, dailyMeta };
}

export function PlaygroundChallengeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState(fallbackValue);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/challenges/active", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const payload = (await response.json()) as { ok?: boolean; dailyChallengeId?: string; startsAt?: string; endsAt?: string; challenge?: { slug?: string; configHash?: string; simulatorVersion?: string; config?: unknown } };
      if (!payload.ok || !payload.challenge?.slug || payload.challenge.config === undefined) return;
      assertChallengeDefinition(payload.challenge.config);
      const challenge = payload.challenge.config;
      if (challenge.slug !== payload.challenge.slug) throw new Error("Active challenge slug does not match its configuration.");
      if (!payload.dailyChallengeId || !payload.startsAt || !payload.endsAt || !payload.challenge.configHash || !payload.challenge.simulatorVersion) throw new Error("Active challenge metadata is incomplete.");
      setValue(valueForChallenge(challenge, "daily", { dailyChallengeId: payload.dailyChallengeId, startsAt: payload.startsAt, endsAt: payload.endsAt, configHash: payload.challenge.configHash, simulatorVersion: payload.challenge.simulatorVersion }));
    }).catch(() => {
      // Local/dev fallback is intentional when Supabase is unavailable or has no active window.
    });
    return () => controller.abort();
  }, []);
  return <PlaygroundChallengeContext.Provider value={value}>{children}</PlaygroundChallengeContext.Provider>;
}

export function usePlaygroundChallenge(): PlaygroundChallengeValue {
  const value = useContext(PlaygroundChallengeContext);
  if (!value) throw new Error("usePlaygroundChallenge must be used within PlaygroundChallengeProvider.");
  return value;
}

/** Sync fallback for non-React utilities during initial local board setup. */
export function activeLevelStarterArchitecture() { return getLevelStarterArchitecture(FALLBACK_SLUG); }
export function challengeRedirectRpsFor(challenge: ChallengeDefinition) { return challenge.workload.requestsPerSecond * challenge.workload.readRatio; }
export function challengeWriteRpsFor(challenge: ChallengeDefinition) { return challenge.workload.requestsPerSecond * challenge.workload.writeRatio; }
export function challengePlaybackDemandRpsFor(challenge: ChallengeDefinition) {
  return challenge.workloadChannels?.find((channel) => channel.id === "playback-start")?.ratePerSecond
    ?? challengeRedirectRpsFor(challenge);
}
export function challengeHotKeyFractionFor(challenge: ChallengeDefinition) { return challenge.workload.hotKeyReadFraction ?? 0; }
export function challengeReadWriteRatioLabelFor(challenge: ChallengeDefinition) { const writeRps = challengeWriteRpsFor(challenge); return writeRps > 0 ? `${Math.round(challengeRedirectRpsFor(challenge) / writeRps)}:1` : "reads only"; }
export function challengeHotKeyLabelFor(challenge: ChallengeDefinition) { const fraction = challengeHotKeyFractionFor(challenge); return fraction > 0 ? `${Math.round(fraction * 100)}% viral key` : "no viral key"; }
