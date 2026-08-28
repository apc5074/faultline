"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import type { CurrentAttemptResponse } from "@/app/api/attempts/current/route";
import type { StartAttemptResponse } from "@/app/api/attempts/start/route";
import { useOfficialAttempt } from "@/features/official-attempt/OfficialAttemptContext";

type PanelState =
  | { status: "loading" }
  | { status: "idle"; alias: string | null }
  | { status: "active"; alias: string; attemptId: string; startedAt: string; challengeVersion: number }
  | { status: "misconfigured" }
  | { status: "error"; message: string };

function formatElapsed(startedAt: string, nowMs: number): string {
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return "—";
  const elapsedSec = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const hours = Math.floor(elapsedSec / 3600);
  const minutes = Math.floor((elapsedSec % 3600) / 60);
  const seconds = elapsedSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Intentional Start Official Attempt control.
 * Ensures identity + persists/restores the server-authoritative attempt.
 * Client elapsed time is display-only.
 */
export function StartOfficialAttempt() {
  const { setSession } = useOfficialAttempt();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  const applyActive = useCallback(
    (input: { alias: string; attemptId: string; startedAt: string; challengeVersion: number }) => {
      setState({ status: "active", ...input });
      setSession({
        attemptId: input.attemptId,
        challengeVersion: input.challengeVersion,
        alias: input.alias,
        startedAt: input.startedAt,
      });
    },
    [setSession],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/attempts/current", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as CurrentAttemptResponse;
      if (!body.ok) {
        setSession(null);
        setState(
          body.code === "misconfigured"
            ? { status: "misconfigured" }
            : { status: "error", message: body.error },
        );
        return;
      }
      if (!body.active) {
        setSession(null);
        if (body.reason === "no_active_challenge") {
          setState({ status: "error", message: "No active daily challenge." });
          return;
        }
        setState({
          status: "idle",
          alias: body.authenticated ? body.alias : null,
        });
        return;
      }
      applyActive({
        alias: body.alias ?? "Player",
        attemptId: body.attemptId,
        startedAt: body.startedAt,
        challengeVersion: body.challengeVersion,
      });
    } catch {
      setSession(null);
      setState({ status: "idle", alias: null });
    }
  }, [applyActive, setSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (state.status !== "active") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  const startOfficialAttempt = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/attempts/start", {
          method: "POST",
          cache: "no-store",
        });
        const body = (await response.json()) as StartAttemptResponse;
        if (!body.ok) {
          setSession(null);
          if (body.code === "misconfigured") {
            setState({ status: "misconfigured" });
          } else if (body.code === "no_active_challenge") {
            setState({ status: "error", message: "No active daily challenge." });
          } else {
            setState({ status: "error", message: body.error });
          }
          return;
        }
        applyActive({
          alias: body.alias,
          attemptId: body.attemptId,
          startedAt: body.startedAt,
          challengeVersion: body.challengeVersion,
        });
      } catch {
        setSession(null);
        setState({ status: "error", message: "Could not start official attempt." });
      }
    });
  };

  return (
    <aside className="official-attempt official-attempt--compact" aria-label="Official attempt">
      {state.status === "active" ? (
        <p className="official-attempt__timer tabular" role="status" aria-label="Official run elapsed time">
          Attempt {formatElapsed(state.startedAt, nowMs)}
        </p>
      ) : (
        <button
          type="button"
          className="official-attempt__button"
          onClick={startOfficialAttempt}
          disabled={pending || state.status === "misconfigured" || state.status === "loading"}
        >
          {pending || state.status === "loading" ? "Starting…" : "Start Attempt"}
        </button>
      )}
      {state.status === "error" ? (
        <p className="official-attempt__status official-attempt__status--error" role="status">
          {state.message}
        </p>
      ) : null}
      {state.status === "misconfigured" ? (
        <p className="official-attempt__status" role="status">
          Official attempts are unavailable here. You can keep building and running simulations.
        </p>
      ) : null}
    </aside>
  );
}
