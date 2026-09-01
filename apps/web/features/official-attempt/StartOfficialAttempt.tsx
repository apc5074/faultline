"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { CurrentAttemptResponse } from "@/app/api/attempts/current/route";
import type { StartAttemptResponse } from "@/app/api/attempts/start/route";
import { useOfficialAttempt } from "@/features/official-attempt/OfficialAttemptContext";

type PanelState =
  | { status: "loading" }
  | { status: "idle"; alias: string | null }
  | {
      status: "active";
      alias: string;
      attemptId: string;
      startedAt: string;
      challengeVersion: number;
    }
  | { status: "complete"; streak: number | null }
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
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

/**
 * Intentional Start Official Attempt control.
 * Ensures identity + persists/restores the server-authoritative attempt.
 * Client elapsed time is display-only.
 */
export function StartOfficialAttempt({
  variant = "plate",
  label = "Start Attempt",
}: {
  variant?: "plate" | "inline";
  label?: string;
}) {
  const { completion, session, setCompletion, setSession } = useOfficialAttempt();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const applyActive = useCallback(
    (input: {
      alias: string;
      attemptId: string;
      startedAt: string;
      challengeVersion: number;
    }) => {
      setState({ status: "active", ...input });
      setSession({
        attemptId: input.attemptId,
        challengeVersion: input.challengeVersion,
        alias: input.alias,
        startedAt: input.startedAt,
      });
    },
    [setSession]
  );

  const startAttempt = useCallback(async () => {
    try {
      const response = await fetch("/api/attempts/start", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as StartAttemptResponse;
      if (!body.ok) {
        setSession(null);
        setCompletion(null);
        if (body.code === "misconfigured") {
          setState({ status: "misconfigured" });
        } else if (body.code === "no_active_challenge") {
          setState({
            status: "error",
            message: "No active daily challenge.",
          });
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
      setCompletion(null);
    } catch {
      setSession(null);
      setState({
        status: "error",
        message: "Could not start official attempt.",
      });
    }
  }, [applyActive, setCompletion, setSession]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/attempts/current", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as CurrentAttemptResponse;
      if (!body.ok) {
        // A restore request can finish after the level-entry start request.
        // Do not let that stale response erase the newly active timer.
        if (sessionRef.current) return;
        setSession(null);
        setState(
          body.code === "misconfigured"
            ? { status: "misconfigured" }
            : { status: "error", message: body.error }
        );
        return;
      }
      if (!body.active) {
        // The initial restore and automatic start may race. Preserve the
        // active session if it was established while restore was in flight.
        if (sessionRef.current) return;
        setSession(null);
        setCompletion(null);
        if (body.reason === "no_active_challenge") {
          setState({ status: "error", message: "No active daily challenge." });
          return;
        }
        // A fresh level starts its official attempt on load. The server
        // authors startedAt, so the visible timer begins at the real start
        // of the attempt rather than at a browser render.
        await startAttempt();
        return;
      }
      applyActive({
        alias: body.alias ?? "Player",
        attemptId: body.attemptId,
        startedAt: body.startedAt,
        challengeVersion: body.challengeVersion,
      });
      setCompletion(body.lastSubmission ? { streak: null, submission: body.lastSubmission } : null);
    } catch {
      setSession(null);
      setCompletion(null);
      setState({ status: "idle", alias: null });
    }
  }, [applyActive, setSession, startAttempt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const revalidate = () => void refresh();
    window.addEventListener("focus", revalidate);
    return () => window.removeEventListener("focus", revalidate);
  }, [refresh]);

  useEffect(() => {
    if (state.status !== "active") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  useEffect(() => {
    if (!session) return;
    setState({ status: "active", ...session });
  }, [session]);

  useEffect(() => {
    if (completion) setState({ status: "complete", streak: completion.streak });
  }, [completion]);

  const startOfficialAttempt = () => {
    startTransition(() => {
      void startAttempt();
    });
  };

  const content = (
    <>
      {state.status === "active" ? (
        <p
          className="official-attempt__timer tabular"
          role="status"
          aria-label="Official run elapsed time"
        >
          Attempt {formatElapsed(state.startedAt, nowMs)}
        </p>
      ) : state.status === "complete" ? (
        <p
          className="official-attempt__timer official-attempt__timer--complete tabular"
          role="status"
        >
          {state.streak === null
            ? "Level passed"
            : `${state.streak} day streak · Level passed`}
        </p>
      ) : (
        <button
          type="button"
          className="official-attempt__button"
          onClick={startOfficialAttempt}
          disabled={
            pending ||
            state.status === "loading"
          }
        >
          {pending || state.status === "loading"
            ? "Starting…"
            : state.status === "misconfigured"
              ? "Try again"
              : label}
        </button>
      )}
      {state.status === "error" ? (
        <p
          className="official-attempt__status official-attempt__status--error"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "misconfigured" ? (
        <p className="official-attempt__status" role="status">
          Official attempts are temporarily unavailable. Try again shortly.
        </p>
      ) : null}
    </>
  );

  if (variant === "inline")
    return <div className="official-attempt--inline">{content}</div>;

  return (
    <aside
      className="official-attempt official-attempt--compact"
      aria-label="Official attempt"
    >
      {content}
    </aside>
  );
}
