"use client";

import { useCallback, useEffect, useState } from "react";

import type { CheapestLeaderboardResponse } from "@/app/api/leaderboards/cheapest/route";
import type { FastestLeaderboardResponse } from "@/app/api/leaderboards/fastest/route";
import type { MyLeaderboardResponse } from "@/app/api/leaderboards/me/route";
import {
  formatLeaderboardCost,
  formatSolveTime,
} from "@/lib/leaderboards/format";

export type LeaderboardMode = "fastest" | "cheapest";

type LeaderboardRow = {
  rank: number;
  alias: string;
  solveMs: number;
  cost: number;
};

type BoardState =
  | { status: "loading" }
  | {
      status: "ready";
      challengeTitle: string;
      challengeSlug: string;
      challengeVersion: number;
      mode: LeaderboardMode;
      rows: readonly LeaderboardRow[];
      myRow: LeaderboardRow | null;
    }
  | { status: "misconfigured" }
  | { status: "unavailable"; message: string };

const PODIUM_RANKS = [1, 2, 3] as const;

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
        nextMode === "fastest"
          ? "/api/leaderboards/fastest"
          : "/api/leaderboards/cheapest";
      const [response, myResponse] = await Promise.all([
        fetch(path, { method: "GET", cache: "no-store" }),
        fetch("/api/leaderboards/me", { method: "GET", cache: "no-store" }),
      ]);
      const body = (await response.json()) as
        | FastestLeaderboardResponse
        | CheapestLeaderboardResponse;
      const myBody = (await myResponse.json()) as MyLeaderboardResponse;
      if (!body.ok) {
        setState(
          body.code === "misconfigured"
            ? { status: "misconfigured" }
            : { status: "unavailable", message: body.error }
        );
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
          ? (
              body as Extract<FastestLeaderboardResponse, { ok: true }>
            ).entries.map((entry) => ({
              rank: entry.rank,
              alias: entry.alias,
              solveMs: entry.fastestSolveMs,
              cost: entry.costAtFastest,
            }))
          : (
              body as Extract<CheapestLeaderboardResponse, { ok: true }>
            ).entries.map((entry) => ({
              rank: entry.rank,
              alias: entry.alias,
              solveMs: entry.solveTimeAtCheapestMs,
              cost: entry.cheapestCost,
            }));

      setState({
        status: "ready",
        challengeTitle: body.challengeTitle,
        challengeSlug: body.challengeSlug,
        challengeVersion: body.challengeVersion,
        mode: nextMode,
        rows,
        myRow,
      });
    } catch {
      setState({
        status: "unavailable",
        message: "Could not load leaderboard.",
      });
    }
  }, []);

  useEffect(() => {
    void refresh(mode);
  }, [mode, refresh]);

  return (
    <aside
      className="hud-plate hud-plate--leaderboard"
      aria-label="Daily leaderboard"
    >
      <div className="hud-plate__toolbar">
        <p className="hud-plate__title">Leaderboard</p>
        <button
          type="button"
          className="hud-plate__action"
          onClick={() => void refresh(mode)}
        >
          Refresh
        </button>
      </div>

      <div
        className="hud-plate__segmented"
        role="group"
        aria-label="Leaderboard mode"
      >
        <button
          type="button"
          className={`hud-plate__segment${
            mode === "fastest" ? " hud-plate__segment--active" : ""
          }`}
          aria-pressed={mode === "fastest"}
          onClick={() => setMode("fastest")}
        >
          Fastest
        </button>
        <button
          type="button"
          className={`hud-plate__segment hud-plate__segment--joined${
            mode === "cheapest" ? " hud-plate__segment--active" : ""
          }`}
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
        <p className="hud-plate__empty">
          Competition storage is not configured.
        </p>
      ) : null}

      {state.status === "unavailable" ? (
        <p className="hud-plate__empty">{state.message}</p>
      ) : null}

      {state.status === "ready" ? (
        <>
          <p className="hud-plate__meta">
            {state.challengeTitle}
            {state.mode === "cheapest" ? " · by cost" : " · by time"}
          </p>

          {(() => {
            // The podium is deliberately fixed: unclaimed places remain visible until
            // verified players fill them, then each later rank joins the list below.
            const visibleLimit = Math.max(3, maxEntries ?? state.rows.length);
            const topRows = state.rows.slice(0, visibleLimit);
            const listRows = topRows.filter((entry) => entry.rank > 3);
            const showNearby =
              state.myRow !== null &&
              !topRows.some((entry) => entry.rank === state.myRow?.rank);
            const nearbyRows = showNearby
              ? state.rows.filter(
                  (entry) =>
                    entry.rank >= (state.myRow?.rank ?? 0) - 2 &&
                    entry.rank <= (state.myRow?.rank ?? 0) + 2
                )
              : [];
            const nearbyDisplayRows =
              showNearby &&
              state.myRow &&
              !nearbyRows.some((entry) => entry.rank === state.myRow?.rank)
                ? [...nearbyRows, state.myRow].sort(
                    (left, right) => left.rank - right.rank
                  )
                : nearbyRows;
            const nearbyListRows = nearbyDisplayRows.filter(
              (entry) => entry.rank > 3
            );
            const lastVisibleRank = topRows.at(-1)?.rank ?? 3;
            const omittedCount = nearbyListRows[0]
              ? Math.max(0, nearbyListRows[0].rank - lastVisibleRank - 1)
              : 0;

            return (
              <>
                {state.rows.length === 0 ? (
                  <p className="hud-plate__empty" aria-label="First solve claims number one.">
                    First solve claims #1.
                  </p>
                ) : null}
                <section
                  className="hud-plate__podium tabular"
                  aria-label="Top three places"
                >
                  {PODIUM_RANKS.map((rank) => {
                    const entry = state.rows.find((row) => row.rank === rank);
                    const isSelf = entry?.rank === state.myRow?.rank;
                    return (
                      <div
                        key={rank}
                        className={`hud-plate__podium-row hud-plate__podium-row--${rank}${
                          entry ? "" : " hud-plate__podium-row--open"
                        }${isSelf ? " hud-plate__rank-list-self" : ""}`}
                      >
                        <span className="hud-plate__podium-glyph" aria-hidden>
                          {rank === 1 ? "◆" : rank === 2 ? "◇" : "▸"}
                        </span>
                        <span className="hud-plate__rank">#{rank}</span>
                        {entry ? (
                          <>
                            <span className="hud-plate__alias">
                              {entry.alias}
                            </span>
                            <span className="hud-plate__metric">
                              {state.mode === "fastest"
                                ? formatSolveTime(entry.solveMs)
                                : formatLeaderboardCost(entry.cost)}
                            </span>
                            <span className="hud-plate__podium-secondary">
                              {state.mode === "fastest"
                                ? formatLeaderboardCost(entry.cost)
                                : formatSolveTime(entry.solveMs)}
                            </span>
                          </>
                        ) : (
                          <span
                            className="hud-plate__podium-open"
                            role="status"
                          >
                            Open
                          </span>
                        )}
                      </div>
                    );
                  })}
                </section>

                {listRows.length > 0 ? (
                  <ol
                    className="hud-plate__rank-list tabular"
                    aria-label="Leaderboard ranks"
                  >
                    {listRows.map((entry) => (
                      <li
                        key={entry.rank}
                        className={
                          state.myRow?.rank === entry.rank
                            ? "hud-plate__rank-list-self"
                            : undefined
                        }
                      >
                        <span className="hud-plate__rank">#{entry.rank}</span>
                        <span className="hud-plate__alias">{entry.alias}</span>
                        <span className="hud-plate__metric">
                          {state.mode === "fastest"
                            ? formatSolveTime(entry.solveMs)
                            : formatLeaderboardCost(entry.cost)}
                        </span>
                        <span className="hud-plate__metric hud-plate__metric--secondary">
                          {state.mode === "fastest"
                            ? formatLeaderboardCost(entry.cost)
                            : formatSolveTime(entry.solveMs)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {showNearby && omittedCount > 0 ? (
                  <div
                    className="hud-plate__rank-gap"
                    aria-label={`${omittedCount} entries not shown`}
                  >
                    <span aria-hidden />
                    <span>+{omittedCount} entries</span>
                    <span aria-hidden />
                  </div>
                ) : null}

                {showNearby && nearbyListRows.length > 0 ? (
                  <ol
                    className="hud-plate__rank-list hud-plate__rank-list--nearby tabular"
                    aria-label="Your position"
                  >
                    {nearbyListRows.map((entry) => (
                      <li
                        key={entry.rank}
                        className={
                          state.myRow?.rank === entry.rank
                            ? "hud-plate__rank-list-self"
                            : undefined
                        }
                      >
                        <span className="hud-plate__rank">#{entry.rank}</span>
                        <span className="hud-plate__alias">
                          {entry.alias}
                          {state.myRow?.rank === entry.rank ? (
                            <span className="hud-plate__you-tag">You</span>
                          ) : null}
                        </span>
                        <span className="hud-plate__metric">
                          {state.mode === "fastest"
                            ? formatSolveTime(entry.solveMs)
                            : formatLeaderboardCost(entry.cost)}
                        </span>
                        <span className="hud-plate__metric hud-plate__metric--secondary">
                          {state.mode === "fastest"
                            ? formatLeaderboardCost(entry.cost)
                            : formatSolveTime(entry.solveMs)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </>
            );
          })()}
        </>
      ) : null}
    </aside>
  );
}
