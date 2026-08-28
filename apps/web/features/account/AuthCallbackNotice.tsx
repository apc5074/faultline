"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { AuthCallbackErrorCode } from "@/lib/auth/account-status";
import { AUTH_CALLBACK_ERROR_MESSAGES } from "@/lib/auth/github-oauth";

function isAuthCallbackErrorCode(value: string): value is AuthCallbackErrorCode {
  return value in AUTH_CALLBACK_ERROR_MESSAGES;
}

/**
 * Surfaces OAuth callback success/failure from query params.
 * Does not redirect on its own — only displays a dismissible notice.
 */
export function AuthCallbackNotice() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("error");

  useEffect(() => {
    const errorCode = searchParams.get("auth_error");
    const signedIn = searchParams.get("auth_signed_in") === "1";
    const linked = searchParams.get("auth_linked") === "1";

    if (linked) {
      setTone("success");
      setMessage("Linked to GitHub. Your alias, attempt, submissions, and leaderboard rank are preserved.");
      return;
    }

    if (signedIn) {
      setTone("success");
      setMessage("Signed in with GitHub.");
      return;
    }

    if (errorCode && isAuthCallbackErrorCode(errorCode)) {
      setTone("error");
      setMessage(AUTH_CALLBACK_ERROR_MESSAGES[errorCode]);
      return;
    }

    setMessage(null);
  }, [searchParams]);

  useEffect(() => {
    if (!message || tone !== "success") return;
    const timeout = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timeout);
  }, [message, tone]);

  if (!message) return null;

  return (
    <div
      className={`auth-callback-notice auth-callback-notice--${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <p>{message}</p>
      <button
        type="button"
        className="auth-callback-notice__dismiss"
        aria-label="Dismiss"
        onClick={() => setMessage(null)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
