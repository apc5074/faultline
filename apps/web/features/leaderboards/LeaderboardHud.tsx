"use client";

import { useCallback, useEffect, useState } from "react";

import type { CheapestLeaderboardResponse } from "@/app/api/leaderboards/cheapest/route";
import type { FastestLeaderboardResponse } from "@/app/api/leaderboards/fastest/route";
import type { MyLeaderboardResponse } from "@/app/api/leaderboards/me/route";
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
      myRow: {
        rank: number;
        alias: string;
        solveMs: number;
        cost: number;
      } | null;
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
      const [response, myResponse] = await Promise.all([
        fetch(path, { method: "GET", cache: "no-store" }),
        fetch("/api/leaderboards/me", { method: "GET", cache: "no-store" }),
      ]);
      const body = (await response.json()) as FastestLeaderboardResponse | CheapestLeaderboardResponse;
      const myBody = (await myResponse.json()) as MyLeaderboardResponse;
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

      const myRow =
        myBody.ok &&
        myBody.ranked &&
        myBody.dailyChallengeId === body.dailyChallengeId &&
        myBody.challengeVersion === body.challengeVersion
          ? nextMode === "fastest"
            ? {
                rank: myBody.fastestRank,
                alias: myBody.alias,
                solveMs: myBody.fastestSolveMs,
                cost: myBody.costAtFastest,
              }
            : {
                rank: myBody.cheapestRank,
                alias: myBody.alias,
                solveMs: myBody.solveTimeAtCheapestMs,
                cost: myBody.cheapestCost,
              }
          : null;

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
        myRow,
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
          {(() => {
            const visibleLimit = maxEntries ?? state.rows.length;
            const topRows = state.rows.slice(0, visibleLimit);
            const showNearby =
              state.myRow !== null &&
              !topRows.some((entry) => entry.rank === state.myRow?.rank);
            const nearbyRows = showNearby
              ? state.rows.filter(
                  (entry) =>
                    entry.rank >= (state.myRow?.rank ?? 0) - 2 &&
                    entry.rank <= (state.myRow?.rank ?? 0) + 2,
                )
              : topRows;
            const displayRows =
              showNearby &&
              state.myRow &&
              !nearbyRows.some((entry) => entry.rank === state.myRow?.rank)
                ? [...nearbyRows, state.myRow].sort((left, right) => left.rank - right.rank)
                : nearbyRows;

            return (
              <ol className="hud-plate__rank-list tabular">
                {showNearby ? (
                  <li className="hud-plate__rank-gap" aria-hidden>
                    …
                  </li>
                ) : null}
                {displayRows.map((entry) => (
                  <li
                    key={entry.rank}
                    className={state.myRow?.rank === entry.rank ? "hud-plate__rank-list-self" : undefined}
                  >
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
                {showNearby ? (
                  <li className="hud-plate__rank-gap" aria-hidden>
                    …
                  </li>
                ) : null}
              </ol>
            );
          })()}
        </>
      ) : null}
    </aside>
  );
}
