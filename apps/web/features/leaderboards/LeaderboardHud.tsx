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
export function LeaderboardHud({ maxEntries }: { maxEntries?: number } = {}) {
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
    <aside className="hud-plate hud-plate--leaderboard" aria-label="Daily leaderboard">
      <div className="hud-plate__toolbar">
        <p className="hud-plate__title">Leaderboard</p>
        <button type="button" className="hud-plate__action" onClick={() => void refresh(mode)}>
          Refresh
        </button>
      </div>

      <div className="hud-plate__segmented" role="group" aria-label="Leaderboard mode">
        <button
          type="button"
          className={`hud-plate__segment${mode === "fastest" ? " hud-plate__segment--active" : ""}`}
          aria-pressed={mode === "fastest"}
          onClick={() => setMode("fastest")}
        >
          Fastest
        </button>
        <button
          type="button"
          className={`hud-plate__segment hud-plate__segment--joined${mode === "cheapest" ? " hud-plate__segment--active" : ""}`}
          aria-pressed={mode === "cheapest"}
          onClick={() => setMode("cheapest")}
        >
          Cheapest
        </button>
      </div>

      {state.status === "loading" ? (
        <p className="hud-plate__empty">Loading rankings…</p>
      ) : null}

      {state.status === "misconfigured" ? (
        <p className="hud-plate__empty">Competition storage is not configured.</p>
      ) : null}

      {state.status === "unavailable" ? (
        <p className="hud-plate__empty">{state.message}</p>
      ) : null}

      {state.status === "empty" ? (
        <p className="hud-plate__empty">
          No verified, within-budget solves yet for {state.challengeSlug} v{state.challengeVersion}.
        </p>
      ) : null}

      {state.status === "ready" ? (
        <>
          <p className="hud-plate__meta">
            {state.challengeSlug} v{state.challengeVersion}
            {state.mode === "cheapest" ? " · by cost" : " · by time"}
          </p>
          <p className="hud-plate__meta">Verified solves only · all requirements pass · within budget</p>
          <ol className="hud-plate__rank-list tabular">
            {state.rows.slice(0, maxEntries).map((entry) => (
              <li key={`${state.mode}-${entry.rank}-${entry.alias}`}>
                <span className="hud-plate__rank">#{entry.rank}</span>
                <span className="hud-plate__alias">{entry.alias}</span>
                {state.mode === "fastest" ? (
                  <>
                    <span className="hud-plate__metric">{formatSolveTime(entry.solveMs)}</span>
                    <span className="hud-plate__metric">{formatLeaderboardCost(entry.cost)}</span>
                  </>
                ) : (
                  <>
                    <span className="hud-plate__metric">{formatLeaderboardCost(entry.cost)}</span>
                    <span className="hud-plate__metric">{formatSolveTime(entry.solveMs)}</span>
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
