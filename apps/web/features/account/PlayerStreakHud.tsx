"use client";

import { useCallback, useEffect, useState } from "react";

import type { PlayerStreakResponse } from "@/lib/account/streak-types";
import { useOfficialAttempt } from "@/features/official-attempt/OfficialAttemptContext";

type StreakState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "guest" }
  | { status: "link_account" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      currentStreak: number;
      longestStreak: number;
      todayCompleted: boolean;
    };

/**
 * Compact streak display for the playground HUD.
 * Does not imply ranking — completion continuity only.
 */
export function PlayerStreakHud({ compact = false }: { compact?: boolean }) {
  const { session, rankRefreshToken } = useOfficialAttempt();
  const [state, setState] = useState<StreakState>({ status: "idle" });

  const refresh = useCallback(async () => {
    if (!session) {
      setState({ status: "guest" });
      return;
    }

    setState({ status: "loading" });
    try {
      const response = await fetch("/api/account/streak", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as PlayerStreakResponse;
      if (!body.ok) {
        setState({ status: "unavailable", message: "Streak unavailable right now." });
        return;
      }
      if (!body.authenticated) {
        setState({ status: "guest" });
        return;
      }
      if (body.isAnonymous) {
        setState({ status: "link_account" });
        return;
      }
      setState({
        status: "ready",
        currentStreak: body.currentStreak,
        longestStreak: body.longestStreak,
        todayCompleted: body.todayCompleted,
      });
    } catch {
      setState({ status: "unavailable", message: "Streak unavailable right now." });
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh, rankRefreshToken]);

  if (state.status === "idle" || state.status === "guest") {
    return null;
  }

  if (state.status === "loading") {
    return <p className={`player-streak-hud${compact ? " player-streak-hud--compact" : ""}`}>Streak…</p>;
  }

  if (state.status === "link_account") {
    return (
      <p className={`player-streak-hud player-streak-hud--hint${compact ? " player-streak-hud--compact" : ""}`}>
        Link GitHub to track streak
      </p>
    );
  }

  if (state.status === "unavailable") {
    return (
      <p className={`player-streak-hud player-streak-hud--unavailable${compact ? " player-streak-hud--compact" : ""}`}>
        {state.message}
      </p>
    );
  }

  const label =
    state.currentStreak === 0
      ? state.todayCompleted
        ? "Streak started"
        : "No streak yet"
      : compact
        ? "day streak"
        : `${state.currentStreak}-day streak`;

  return (
    <div
      className={`player-streak-hud${compact ? " player-streak-hud--compact" : ""}`}
      aria-label={`Verified daily streak: ${label}`}
    >
      <span className="player-streak-hud__count">{state.currentStreak}</span>
      <span className="player-streak-hud__copy">
        {label}
        {state.todayCompleted ? " · today complete" : ""}
        {!compact && state.longestStreak > state.currentStreak ? (
          <span className="player-streak-hud__best"> · best {state.longestStreak}</span>
        ) : null}
      </span>
    </div>
  );
}
