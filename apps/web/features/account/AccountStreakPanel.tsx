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
      const response = await fetch("/api/account/streak", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as PlayerStreakResponse;
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
      setState({
        status: "ready",
        currentStreak: body.currentStreak,
        longestStreak: body.longestStreak,
        todayCompleted: body.todayCompleted,
        lastCompletedStartsAt: body.lastCompletedStartsAt,
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
        <strong>{state.currentStreak}</strong> current · <strong>{state.longestStreak}</strong> best
      </p>
      <dl className="account-streak__details">
        <div>
          <dt>Today</dt>
          <dd>{state.todayCompleted ? "Complete" : "Not yet"}</dd>
        </div>
        <div>
          <dt>Last verified day</dt>
          <dd>{formatDay(state.lastCompletedStartsAt)}</dd>
        </div>
      </dl>
      {state.currentStreak === 0 && !state.todayCompleted ? (
        <p className="account-streak__hint">Complete today&apos;s official challenge to start your streak.</p>
      ) : null}
    </section>
  );
}
