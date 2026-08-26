"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import type { AnonymousAuthResponse } from "@/app/api/auth/anonymous/route";
import type { AuthMeResponse } from "@/app/api/auth/me/route";

type IdentityState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "misconfigured" }
  | { status: "ready"; alias: string; isAnonymous: boolean }
  | { status: "error"; message: string };

/**
 * Starts (or resumes) an anonymous competition identity with a stable public alias.
 * Does not gate local play — visitors can build/simulate without clicking this.
 * Official attempt persistence arrives in later Phase 4 tickets.
 */
export function StartOfficialAttempt() {
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [pending, startTransition] = useTransition();

  const refreshIdentity = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as AuthMeResponse;
      if (!body.configured) {
        setIdentity({ status: "misconfigured" });
        return;
      }
      if (!body.authenticated) {
        setIdentity({ status: "guest" });
        return;
      }
      if (!body.alias) {
        setIdentity({ status: "guest" });
        return;
      }
      setIdentity({
        status: "ready",
        alias: body.alias,
        isAnonymous: body.isAnonymous,
      });
    } catch {
      setIdentity({ status: "guest" });
    }
  }, []);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  const startOfficialAttempt = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/anonymous", {
          method: "POST",
          cache: "no-store",
        });
        const body = (await response.json()) as AnonymousAuthResponse;
        if (!body.ok) {
          if (body.code === "misconfigured") {
            setIdentity({ status: "misconfigured" });
          } else {
            setIdentity({ status: "error", message: body.error });
          }
          return;
        }
        setIdentity({
          status: "ready",
          alias: body.alias,
          isAnonymous: body.isAnonymous,
        });
      } catch {
        setIdentity({ status: "error", message: "Could not start official attempt." });
      }
    });
  };

  return (
    <aside className="official-attempt" aria-label="Official attempt">
      <p className="official-attempt__title">Competition</p>
      {identity.status === "loading" ? (
        <p className="official-attempt__status">Checking identity…</p>
      ) : null}
      {identity.status === "guest" ? (
        <p className="official-attempt__status">Playing as guest — local runs only</p>
      ) : null}
      {identity.status === "misconfigured" ? (
        <p className="official-attempt__status">Supabase not configured</p>
      ) : null}
      {identity.status === "error" ? (
        <p className="official-attempt__status official-attempt__status--error" role="status">
          {identity.message}
        </p>
      ) : null}
      {identity.status === "ready" ? (
        <p className="official-attempt__status official-attempt__status--ready" role="status">
          Playing as {identity.alias}
        </p>
      ) : null}
      <button
        type="button"
        className="official-attempt__button"
        onClick={startOfficialAttempt}
        disabled={pending || identity.status === "misconfigured" || identity.status === "loading"}
      >
        {pending
          ? "Starting…"
          : identity.status === "ready"
            ? "Resume Official Attempt"
            : "Start Official Attempt"}
      </button>
      <p className="official-attempt__hint">
        Builds and simulations work without signing in. Official ranking needs an anonymous identity.
      </p>
    </aside>
  );
}
