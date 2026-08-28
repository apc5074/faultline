"use client";

import { useCallback, useEffect, useState } from "react";

import type { PlayerHistoryResponse } from "@/lib/account/history-types";
import { formatLeaderboardCost, formatSolveTime } from "@/lib/leaderboards/format";

type HistoryState =
  | { status: "loading" }
  | { status: "sign_in" }
  | { status: "link_account" }
  | { status: "empty"; alias: string | null }
  | {
      status: "ready";
      alias: string | null;
      entries: Extract<PlayerHistoryResponse, { ok: true; isAnonymous: false }>["entries"];
      hasMore: boolean;
      offset: number;
      limit: number;
    }
  | { status: "error"; message: string };

function formatChallengeDay(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Unknown day";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function AccountHistoryPanel() {
  const [state, setState] = useState<HistoryState>({ status: "loading" });

  const load = useCallback(async (offset = 0, append = false) => {
    if (!append) setState({ status: "loading" });
    try {
      const response = await fetch(`/api/account/history?limit=20&offset=${offset}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as PlayerHistoryResponse;
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
      if (body.entries.length === 0 && offset === 0) {
        setState({ status: "empty", alias: body.alias });
        return;
      }
      setState((current) => {
        const previousEntries =
          append && current.status === "ready" ? current.entries : [];
        return {
          status: "ready",
          alias: body.alias,
          entries: [...previousEntries, ...body.entries],
          hasMore: body.hasMore,
          offset: body.offset,
          limit: body.limit,
        };
      });
    } catch {
      setState({ status: "error", message: "History is temporarily unavailable." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return <p className="account-history__status">Loading history…</p>;
  }

  if (state.status === "sign_in") {
    return (
      <section className="account-history account-history--cta" aria-labelledby="account-history-title">
        <h2 id="account-history-title">Play history</h2>
        <p>Sign in with GitHub to see your verified challenge history.</p>
        <a className="account-auth-plate__button" href="/api/auth/github?next=%2Faccount">
          Sign in with GitHub
        </a>
      </section>
    );
  }

  if (state.status === "link_account") {
    return (
      <section className="account-history account-history--cta" aria-labelledby="account-history-title">
        <h2 id="account-history-title">Play history</h2>
        <p>
          Link your anonymous progress to GitHub to unlock verified history. Your alias, attempts,
          submissions, and leaderboard rank stay on this account.
        </p>
        <a className="account-auth-plate__button" href="/api/auth/github?next=%2Faccount">
          Link with GitHub
        </a>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="account-history account-history--error" aria-labelledby="account-history-title">
        <h2 id="account-history-title">Play history</h2>
        <p role="alert">{state.message}</p>
        <button type="button" className="account-auth-plate__secondary" onClick={() => void load()}>
          Retry
        </button>
      </section>
    );
  }

  if (state.status === "empty") {
    return (
      <section className="account-history account-history--empty" aria-labelledby="account-history-title">
        <h2 id="account-history-title">Play history</h2>
        <p>
          {state.alias
            ? `${state.alias}, you have no verified official submissions yet.`
            : "You have no verified official submissions yet."}
        </p>
        <a className="account-auth-plate__button" href="/level/1">
          Play Level 1
        </a>
      </section>
    );
  }

  return (
    <section className="account-history" aria-labelledby="account-history-title">
      <div className="account-history__header">
        <h2 id="account-history-title">Play history</h2>
        {state.alias ? <p className="account-history__alias">{state.alias}</p> : null}
      </div>
      <ul className="account-history__list">
        {state.entries.map((entry) => (
          <li key={`${entry.challengeStartsAt}-${entry.challengeSlug}-${entry.submittedAt}`}>
            <article className="account-history__card">
              <header>
                <p className="account-history__day">{formatChallengeDay(entry.challengeStartsAt)}</p>
                <h3>{entry.challengeTitle}</h3>
                <p className="account-history__meta">
                  {entry.challengeSlug} · v{entry.challengeVersion}
                </p>
              </header>
              <dl className="account-history__metrics tabular">
                <div>
                  <dt>Status</dt>
                  <dd className={entry.verified ? "account-history__verified" : "account-history__incomplete"}>
                    {entry.verified ? "Verified" : "Incomplete"}
                  </dd>
                </div>
                <div>
                  <dt>Solve time</dt>
                  <dd>{entry.solveMs === null ? "—" : formatSolveTime(entry.solveMs)}</dd>
                </div>
                <div>
                  <dt>Monthly cost</dt>
                  <dd>
                    {entry.monthlyCostUsd === null ? "—" : formatLeaderboardCost(entry.monthlyCostUsd)}
                  </dd>
                </div>
                <div>
                  <dt>Requirements</dt>
                  <dd>
                    {entry.requirementsPassed}/{entry.requirementsTotal}
                  </dd>
                </div>
              </dl>
              <p className="account-history__submitted">
                Submitted {new Date(entry.submittedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC
              </p>
            </article>
          </li>
        ))}
      </ul>
      {state.hasMore ? (
        <button
          type="button"
          className="account-auth-plate__button"
          onClick={() => void load(state.offset + state.limit, true)}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}
