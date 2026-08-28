/**
 * Shared account identity contracts for routes and UI.
 * See docs/ACCOUNTS.md for lifecycle, linking, and privacy rules.
 */

/** High-level session classification returned by account-aware APIs. */
export type AccountSessionKind = "guest" | "anonymous" | "permanent";

/** Identity providers supported in Phase 12. */
export type AccountProvider = "github";

/**
 * Linking lifecycle while anonymous → permanent transition is in flight.
 * `idle` — no link attempt active.
 * `pending` — OAuth started; awaiting provider callback.
 * `conflict` — GitHub identity already bound to a different permanent user.
 */
export type LinkingState = "idle" | "pending" | "conflict";

/** Same-origin paths permitted after OAuth callback (open-redirect guard). */
export const AUTH_CALLBACK_REDIRECT_ALLOWLIST = ["/", "/level/1", "/play", "/account"] as const;

/** HttpOnly cookie storing anonymous user id during GitHub linking. */
export const ACCOUNT_LINK_COOKIE = "faultline_link_uid";

export type AuthCallbackRedirectPath = (typeof AUTH_CALLBACK_REDIRECT_ALLOWLIST)[number];

/** Returns true when `path` is an allowlisted same-origin continuation path. */
export function isAuthCallbackRedirectAllowed(path: string): path is AuthCallbackRedirectPath {
  return (AUTH_CALLBACK_REDIRECT_ALLOWLIST as readonly string[]).includes(path);
}

/** Normalizes a callback `next` query param to an allowlisted path or `/`. */
export function normalizeAuthCallbackRedirect(path: string | null | undefined): AuthCallbackRedirectPath {
  if (!path) return "/";
  const decoded = path.startsWith("/") ? path : `/${path}`;
  const withoutQuery = decoded.split("?")[0]?.split("#")[0] ?? "/";
  return isAuthCallbackRedirectAllowed(withoutQuery) ? withoutQuery : "/";
}

/** GET /api/auth/me — current session snapshot. Never requires auth to call. */
export type AuthMeResponse =
  | {
      authenticated: false;
      configured: boolean;
    }
  | {
      authenticated: true;
      configured: true;
      userId: string;
      isAnonymous: boolean;
      alias: string | null;
      /** Permanent users only; omitted when anonymous or unknown. */
      provider?: AccountProvider;
      linkingState?: LinkingState;
    };

/** POST /api/auth/anonymous — ensure anonymous identity + alias. */
export type AnonymousAuthResponse =
  | {
      ok: true;
      created: boolean;
      userId: string;
      isAnonymous: boolean;
      alias: string;
      profileCreated: boolean;
    }
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "auth_failed" | "profile_failed";
    };

/** OAuth / linking failure codes surfaced to the UI (no secrets). */
export type AuthCallbackErrorCode =
  | "misconfigured"
  | "provider_denied"
  | "invalid_callback"
  | "expired_code"
  | "session_missing"
  | "link_failed"
  | "link_incomplete"
  | "identity_conflict"
  | "network_error";

/** Derived account status for UI panels (history, streak, sign-in CTA). */
export type AccountStatus =
  | { kind: "guest"; configured: boolean }
  | { kind: "anonymous"; configured: true; userId: string; alias: string | null; linkingState: LinkingState }
  | {
      kind: "permanent";
      configured: true;
      userId: string;
      alias: string;
      provider: AccountProvider;
      linkingState: "idle";
    };

/** Maps a successful AuthMeResponse to AccountStatus. */
export function accountStatusFromAuthMe(response: AuthMeResponse): AccountStatus {
  if (!response.configured) {
    return { kind: "guest", configured: false };
  }
  if (!response.authenticated) {
    return { kind: "guest", configured: true };
  }
  if (response.isAnonymous) {
    return {
      kind: "anonymous",
      configured: true,
      userId: response.userId,
      alias: response.alias,
      linkingState: response.linkingState ?? "idle",
    };
  }
  return {
    kind: "permanent",
    configured: true,
    userId: response.userId,
    alias: response.alias ?? "",
    provider: response.provider ?? "github",
    linkingState: "idle",
  };
}
