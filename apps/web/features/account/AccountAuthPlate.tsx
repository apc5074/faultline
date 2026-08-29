"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";

import type { AuthMeResponse } from "@/lib/auth/account-status";
import { accountStatusFromAuthMe } from "@/lib/auth/account-status";

type PlateState =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "guest" }
  | { status: "anonymous"; alias: string | null; linkingPending: boolean }
  | { status: "permanent"; alias: string; githubUsername?: string };

export function AccountAuthPlate({
  nextPath,
  compact = false,
  minimal = false,
}: {
  nextPath: string;
  compact?: boolean;
  /** Home nav: sign-in button only, no link-progress copy. */
  minimal?: boolean;
}) {
  const [state, setState] = useState<PlateState>(minimal ? { status: "guest" } : { status: "loading" });
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const signInHref = `/api/auth/github?next=${encodeURIComponent(nextPath)}`;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
      const body = (await response.json()) as AuthMeResponse;
      const account = accountStatusFromAuthMe(body);
      if (!account.configured) {
        setState({ status: "hidden" });
        return;
      }
      if (account.kind === "guest") {
        setState({ status: "guest" });
        return;
      }
      if (account.kind === "anonymous") {
        setState({
          status: "anonymous",
          alias: account.alias,
          linkingPending: account.linkingState === "pending",
        });
        return;
      }
      setState({ status: "permanent", alias: account.alias, githubUsername: account.githubUsername });
    } catch {
      setState({ status: "hidden" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSignOut = useCallback(() => {
    setSignOutError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/sign-out", { method: "POST" });
        const body = (await response.json()) as { ok: boolean; error?: string };
        if (!body.ok) {
          setSignOutError(body.error ?? "Could not sign out.");
          return;
        }
        await refresh();
      } catch {
        setSignOutError("Could not sign out.");
      }
    });
  }, [refresh]);

  if (state.status === "loading") {
    return null;
  }

  if (state.status === "hidden") {
    return null;
  }

  if (state.status === "permanent") {
    if (minimal) {
      return (
        <div className={`account-auth-plate account-auth-plate--signed-in account-auth-plate--minimal-signed-in${compact ? " account-auth-plate--compact" : ""}`}>
          <span className="account-auth-plate__alias">{state.githubUsername ? `@${state.githubUsername}` : state.alias}</span>
          <Link className="account-auth-plate__secondary account-auth-plate__secondary--link" href="/account">
            Account
          </Link>
          <button
            type="button"
            className="account-auth-plate__secondary"
            onClick={handleSignOut}
            disabled={pending}
          >
            Sign out
          </button>
          {signOutError ? <p className="account-auth-plate__error">{signOutError}</p> : null}
        </div>
      );
    }

    return (
      <div className={`account-auth-plate account-auth-plate--signed-in${compact ? " account-auth-plate--compact" : ""}`}>
        <span className="account-auth-plate__label">{state.githubUsername ? "GitHub" : "Signed in"}</span>
        <span className="account-auth-plate__alias">{state.githubUsername ? `@${state.githubUsername}` : state.alias}</span>
        <button
          type="button"
          className="account-auth-plate__secondary"
          onClick={handleSignOut}
          disabled={pending}
        >
          Sign out
        </button>
        {signOutError ? <p className="account-auth-plate__error">{signOutError}</p> : null}
      </div>
    );
  }

  if (state.status === "anonymous") {
    if (minimal) {
      return (
        <div className={`account-auth-plate${compact ? " account-auth-plate--compact" : ""}`}>
          <a
            className="account-auth-plate__button"
            href={signInHref}
            aria-busy={state.linkingPending}
          >
            {state.linkingPending ? "Signing in…" : "Sign in with GitHub"}
          </a>
        </div>
      );
    }

    return (
      <div className={`account-auth-plate account-auth-plate--link${compact ? " account-auth-plate--compact" : ""}`}>
        <div className="account-auth-plate__link-copy">
          <p className="account-auth-plate__link-title">Link your progress</p>
          {!compact ? (
            <p className="account-auth-plate__link-body">
              Your alias, official attempt, submissions, and leaderboard rank stay on this account.
            </p>
          ) : null}
        </div>
        <a
          className="account-auth-plate__button"
          href={signInHref}
          aria-busy={state.linkingPending}
        >
          {state.linkingPending ? "Linking…" : "Link with GitHub"}
        </a>
        {state.alias ? (
          <p className="account-auth-plate__hint">Playing as {state.alias}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`account-auth-plate${compact ? " account-auth-plate--compact" : ""}`}>
      <a className="account-auth-plate__button" href={signInHref}>
        Sign in with GitHub
      </a>
    </div>
  );
}
