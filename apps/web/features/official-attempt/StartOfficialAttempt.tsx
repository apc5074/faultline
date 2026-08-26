"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import type { CurrentAttemptResponse } from "@/app/api/attempts/current/route";
import type { StartAttemptResponse } from "@/app/api/attempts/start/route";

type PanelState =
  | { status: "loading" }
  | { status: "idle"; alias: string | null }
  | { status: "active"; alias: string; attemptId: string; startedAt: string }
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
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/attempts/current", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as CurrentAttemptResponse;
      if (!body.ok) {
        setState(
          body.code === "misconfigured"
            ? { status: "misconfigured" }
            : { status: "error", message: body.error },
        );
        return;
      }
      if (!body.active) {
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
      setState({
        status: "active",
        alias: body.alias ?? "Player",
        attemptId: body.attemptId,
        startedAt: body.startedAt,
      });
    } catch {
      setState({ status: "idle", alias: null });
    }
  }, []);

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
          if (body.code === "misconfigured") {
            setState({ status: "misconfigured" });
          } else if (body.code === "no_active_challenge") {
            setState({ status: "error", message: "No active daily challenge." });
          } else {
            setState({ status: "error", message: body.error });
          }
          return;
        }
        setState({
          status: "active",
          alias: body.alias,
          attemptId: body.attemptId,
          startedAt: body.startedAt,
        });
      } catch {
        setState({ status: "error", message: "Could not start official attempt." });
      }
    });
  };

  return (
    <aside className="official-attempt" aria-label="Official attempt">
      <p className="official-attempt__title">Competition</p>
      {state.status === "loading" ? (
        <p className="official-attempt__status">Checking identity…</p>
      ) : null}
      {state.status === "idle" ? (
        <p className="official-attempt__status">
          {state.alias
            ? `Playing as ${state.alias} — start when ready`
            : "Playing as guest — local runs only"}
        </p>
      ) : null}
      {state.status === "misconfigured" ? (
        <p className="official-attempt__status">Supabase not configured</p>
      ) : null}
      {state.status === "error" ? (
        <p className="official-attempt__status official-attempt__status--error" role="status">
          {state.message}
        </p>
      ) : null}
      {state.status === "active" ? (
        <>
          <p className="official-attempt__status official-attempt__status--ready" role="status">
            Playing as {state.alias}
          </p>
          <p className="official-attempt__timer" aria-label="Official run elapsed time">
            Official Run {formatElapsed(state.startedAt, nowMs)}
          </p>
          <p className="official-attempt__hint">Elapsed time is display-only; ranking uses server time.</p>
        </>
      ) : null}
      {state.status !== "active" ? (
        <button
          type="button"
          className="official-attempt__button"
          onClick={startOfficialAttempt}
          disabled={pending || state.status === "misconfigured" || state.status === "loading"}
        >
          {pending ? "Starting…" : "Start Official Attempt"}
        </button>
      ) : (
        <p className="official-attempt__active-label" role="status">
          Official Attempt Active
        </p>
      )}
      {state.status !== "active" ? (
        <p className="official-attempt__hint">
          Builds and simulations work without signing in. Official ranking needs an intentional start.
        </p>
      ) : null}
    </aside>
  );
}
