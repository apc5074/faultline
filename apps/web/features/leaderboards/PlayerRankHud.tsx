"use client";

import { useCallback, useEffect, useState } from "react";

import type { MyLeaderboardResponse } from "@/app/api/leaderboards/me/route";
import { useOfficialAttempt } from "@/features/official-attempt/OfficialAttemptContext";
import { formatLeaderboardCost, formatSolveTime } from "@/lib/leaderboards/format";

type RankState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "guest" }
  | { status: "unranked"; alias: string | null }
  | {
      status: "ranked";
      alias: string;
      fastestRank: number;
      cheapestRank: number;
      fastestSolveMs: number;
      costAtFastest: number;
      cheapestCost: number;
      solveTimeAtCheapestMs: number;
    }
  | { status: "unavailable"; message: string };

/**
 * Shows the authenticated player's verified ranks for the active daily challenge.
 * Guests see no rank; unranked players see an explicit unranked state (never zero).
 */
export function PlayerRankHud() {
  const { session, rankRefreshToken } = useOfficialAttempt();
  const [state, setState] = useState<RankState>({ status: "idle" });

  const refresh = useCallback(async () => {
    if (!session) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/leaderboards/me", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as MyLeaderboardResponse;
      if (!body.ok) {
        setState({ status: "unavailable", message: body.error });
        return;
      }
      if (!body.authenticated) {
        setState({ status: "guest" });
        return;
      }
      if (!body.ranked) {
        setState({ status: "unranked", alias: body.alias });
        return;
      }
      setState({
        status: "ranked",
        alias: body.alias,
        fastestRank: body.fastestRank,
        cheapestRank: body.cheapestRank,
        fastestSolveMs: body.fastestSolveMs,
        costAtFastest: body.costAtFastest,
        cheapestCost: body.cheapestCost,
        solveTimeAtCheapestMs: body.solveTimeAtCheapestMs,
      });
    } catch {
      setState({ status: "unavailable", message: "Could not load your rank." });
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh, rankRefreshToken]);

  if (state.status === "idle") {
    return null;
  }

  return (
    <aside className="hud-plate hud-plate--rank" aria-label="Your competition rank">
      <div className="hud-plate__toolbar">
        <p className="hud-plate__title">Your rank</p>
        {state.status === "ranked" ? (
          <button type="button" className="hud-plate__action" onClick={() => void refresh()}>
            Refresh
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <p className="hud-plate__empty">Loading rank…</p>
      ) : null}

      {state.status === "guest" ? (
        <p className="hud-plate__empty">Start an official attempt to earn a rank.</p>
      ) : null}

      {state.status === "unranked" ? (
        <p className="hud-plate__empty">
          {state.alias ? `${state.alias} — ` : ""}Unranked until a verified within-budget solve.
        </p>
      ) : null}

      {state.status === "unavailable" ? (
        <p className="hud-plate__empty">{state.message}</p>
      ) : null}

      {state.status === "ranked" ? (
        <>
          <p className="hud-plate__summary tabular">
            <span className="hud-plate__mark" aria-hidden>
              ✓
            </span>{" "}
            {state.alias}
          </p>
          <p className="hud-plate__meta tabular">
            Fastest #{state.fastestRank} · Cheapest #{state.cheapestRank}
          </p>
          <details className="hud-plate__details">
            <summary className="hud-plate__details-summary">Verified metrics</summary>
            <dl className="hud-plate__spec tabular">
              <div>
                <dt>Solve time</dt>
                <dd>{formatSolveTime(state.fastestSolveMs)}</dd>
              </div>
              <div>
                <dt>Cost at fastest</dt>
                <dd>{formatLeaderboardCost(state.costAtFastest)}</dd>
              </div>
              <div>
                <dt>Cheapest cost</dt>
                <dd>{formatLeaderboardCost(state.cheapestCost)}</dd>
              </div>
              <div>
                <dt>Time at cheapest</dt>
                <dd>{formatSolveTime(state.solveTimeAtCheapestMs)}</dd>
              </div>
            </dl>
          </details>
        </>
      ) : null}
    </aside>
  );
}
