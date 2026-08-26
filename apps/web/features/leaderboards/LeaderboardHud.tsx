"use client";

import { useCallback, useEffect, useState } from "react";

import type { CheapestLeaderboardResponse } from "@/app/api/leaderboards/cheapest/route";
import type { FastestLeaderboardResponse } from "@/app/api/leaderboards/fastest/route";
import { formatLeaderboardCost, formatSolveTime } from "@/lib/leaderboards/format";

export type LeaderboardMode = "fastest" | "cheapest";

type BoardState =
  | { status: "loading" }
  | { status: "empty"; challengeSlug: string; challengeVersion: number }
  | {
      status: "ready";
      challengeSlug: string;
      challengeVersion: number;
      mode: LeaderboardMode;
      rows: readonly {
        rank: number;
        alias: string;
        solveMs: number;
        cost: number;
      }[];
    }
  | { status: "misconfigured" }
  | { status: "unavailable"; message: string };

/**
 * Public leaderboard HUD with Fastest | Cheapest toggle.
 * Both boards read the same `daily_best` projection through separate public endpoints.
 */
export function LeaderboardHud() {
  const [mode, setMode] = useState<LeaderboardMode>("fastest");
  const [state, setState] = useState<BoardState>({ status: "loading" });

  const refresh = useCallback(async (nextMode: LeaderboardMode) => {
    setState({ status: "loading" });
    try {
      const path =
        nextMode === "fastest" ? "/api/leaderboards/fastest" : "/api/leaderboards/cheapest";
      const response = await fetch(path, { method: "GET", cache: "no-store" });
      const body = (await response.json()) as FastestLeaderboardResponse | CheapestLeaderboardResponse;
      if (!body.ok) {
        setState(
          body.code === "misconfigured"
            ? { status: "misconfigured" }
            : { status: "unavailable", message: body.error },
        );
        return;
      }
      if (body.entries.length === 0) {
        setState({
          status: "empty",
          challengeSlug: body.challengeSlug,
          challengeVersion: body.challengeVersion,
        });
        return;
      }

      const rows =
        nextMode === "fastest"
          ? (body as Extract<FastestLeaderboardResponse, { ok: true }>).entries.map((entry) => ({
              rank: entry.rank,
              alias: entry.alias,
              solveMs: entry.fastestSolveMs,
              cost: entry.costAtFastest,
            }))
          : (body as Extract<CheapestLeaderboardResponse, { ok: true }>).entries.map((entry) => ({
              rank: entry.rank,
              alias: entry.alias,
              solveMs: entry.solveTimeAtCheapestMs,
              cost: entry.cheapestCost,
            }));

      setState({
        status: "ready",
        challengeSlug: body.challengeSlug,
        challengeVersion: body.challengeVersion,
        mode: nextMode,
        rows,
      });
    } catch {
      setState({ status: "unavailable", message: "Could not load leaderboard." });
    }
  }, []);

  useEffect(() => {
    void refresh(mode);
  }, [mode, refresh]);

  return (
    <aside className="leaderboard-hud" aria-label="Daily leaderboard">
      <div className="leaderboard-hud__header">
        <div className="leaderboard-hud__tabs" role="group" aria-label="Leaderboard mode">
          <button
            type="button"
            className={
              mode === "fastest"
                ? "leaderboard-hud__tab leaderboard-hud__tab--active"
                : "leaderboard-hud__tab"
            }
            aria-pressed={mode === "fastest"}
            onClick={() => setMode("fastest")}
          >
            Fastest
          </button>
          <button
            type="button"
            className={
              mode === "cheapest"
                ? "leaderboard-hud__tab leaderboard-hud__tab--active"
                : "leaderboard-hud__tab"
            }
            aria-pressed={mode === "cheapest"}
            onClick={() => setMode("cheapest")}
          >
            Cheapest
          </button>
        </div>
        <button type="button" className="leaderboard-hud__refresh" onClick={() => void refresh(mode)}>
          Refresh
        </button>
      </div>

      {state.status === "loading" ? (
        <p className="leaderboard-hud__empty">Loading rankings…</p>
      ) : null}

      {state.status === "misconfigured" ? (
        <p className="leaderboard-hud__empty">Competition storage is not configured.</p>
      ) : null}

      {state.status === "unavailable" ? (
        <p className="leaderboard-hud__empty">{state.message}</p>
      ) : null}

      {state.status === "empty" ? (
        <p className="leaderboard-hud__empty">
          No verified solves yet for {state.challengeSlug} v{state.challengeVersion}.
        </p>
      ) : null}

      {state.status === "ready" ? (
        <>
          <p className="leaderboard-hud__meta">
            {state.challengeSlug} v{state.challengeVersion}
            {state.mode === "cheapest" ? " · by cost" : " · by time"}
          </p>
          <ol className="leaderboard-hud__list">
            {state.rows.map((entry) => (
              <li key={`${state.mode}-${entry.rank}-${entry.alias}`}>
                <span className="leaderboard-hud__rank">#{entry.rank}</span>
                <span className="leaderboard-hud__alias">{entry.alias}</span>
                {state.mode === "fastest" ? (
                  <>
                    <span className="leaderboard-hud__time">{formatSolveTime(entry.solveMs)}</span>
                    <span className="leaderboard-hud__cost">{formatLeaderboardCost(entry.cost)}</span>
                  </>
                ) : (
                  <>
                    <span className="leaderboard-hud__cost">{formatLeaderboardCost(entry.cost)}</span>
                    <span className="leaderboard-hud__time">{formatSolveTime(entry.solveMs)}</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </aside>
  );
}
