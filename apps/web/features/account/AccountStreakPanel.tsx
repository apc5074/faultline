"use client";

import { useCallback, useEffect, useState } from "react";

import type { PlayerStreakResponse } from "@/lib/account/streak-types";

type PanelState =
  | { status: "loading" }
  | { status: "sign_in" }
  | { status: "link_account" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      currentStreak: number;
      longestStreak: number;
      todayCompleted: boolean;
      lastCompletedStartsAt: string | null;
      completionDays: string[];
      bestRank: number | null;
    };

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function AccountStreakPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [streakResponse, overviewResponse] = await Promise.all([
        fetch("/api/account/streak", { method: "GET", cache: "no-store" }),
        fetch("/api/account/overview", { method: "GET", cache: "no-store" }),
      ]);
      const body = (await streakResponse.json()) as PlayerStreakResponse;
      const overview = (await overviewResponse.json()) as
        | { ok: true; authenticated: false }
        | { ok: true; authenticated: true; isAnonymous: true }
        | { ok: true; authenticated: true; isAnonymous: false; completionDays: string[]; bestRank: number | null }
        | { ok: false; error: string };
      if (!body.ok) {
        setState({ status: "error", message: body.error });
        return;
      }
      if (!body.authenticated) {
        setState({ status: "sign_in" });
        return;
      }
      if (body.isAnonymous) {
        setState({ status: "link_account" });
        return;
      }
      if (!overview.ok || !overview.authenticated || overview.isAnonymous) {
        setState({ status: "error", message: "Account data is temporarily unavailable." });
        return;
      }
      setState({
        status: "ready",
        currentStreak: body.currentStreak,
        longestStreak: body.longestStreak,
        todayCompleted: body.todayCompleted,
        lastCompletedStartsAt: body.lastCompletedStartsAt,
        completionDays: overview.completionDays,
        bestRank: overview.bestRank,
      });
    } catch {
      setState({ status: "error", message: "Streak is temporarily unavailable." });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state.status === "loading") {
    return <p className="account-streak__status">Loading streak…</p>;
  }

  if (state.status === "sign_in" || state.status === "link_account") {
    return null;
  }

  if (state.status === "error") {
    return (
      <section className="account-streak account-streak--error" aria-labelledby="account-streak-title">
        <h2 id="account-streak-title">Daily streak</h2>
        <p role="alert">{state.message}</p>
        <button type="button" className="account-auth-plate__secondary" onClick={() => void refresh()}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="account-streak" aria-labelledby="account-streak-title">
      <h2 id="account-streak-title">Daily streak</h2>
      <p className="account-streak__summary">
        <strong>{state.currentStreak}</strong> current streak · <strong>{state.longestStreak}</strong> longest
      </p>
      <div className="account-completion-graph" role="img" aria-label={`${state.completionDays.length} verified completion days`}>
        {Array.from({ length: 84 }, (_, index) => {
          const date = new Date();
          date.setUTCDate(date.getUTCDate() - (83 - index));
          const day = date.toISOString().slice(0, 10);
          const completed = state.completionDays.includes(day);
          return <span key={day} className={completed ? "account-completion-graph__day account-completion-graph__day--complete" : "account-completion-graph__day"} title={day} />;
        })}
      </div>
      <dl className="account-streak__details">
        <div>
          <dt>Today</dt>
          <dd>{state.todayCompleted ? "Complete" : "Not yet"}</dd>
        </div>
        <div>
          <dt>Last verified day</dt>
          <dd>{formatDay(state.lastCompletedStartsAt)}</dd>
        </div>
        <div>
          <dt>Best leaderboard rank</dt>
          <dd>{state.bestRank === null ? "Unranked" : `#${state.bestRank}`}</dd>
        </div>
      </dl>
      {state.currentStreak === 0 && !state.todayCompleted ? (
        <p className="account-streak__hint">Complete today&apos;s official challenge to start your streak.</p>
      ) : null}
    </section>
  );
}
