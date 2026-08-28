export type FinalizeLinkInput = {
  linkIntentUserId: string | null;
  userId: string;
  isAnonymous: boolean;
  hasGitHubProvider: boolean;
};

export type FinalizeLinkResult =
  | { ok: true; kind: "linked" | "returning_sign_in" }
  | { ok: false; code: "identity_conflict" | "link_incomplete" | "session_missing" };

/**
 * Verifies OAuth callback outcome for anonymous linking.
 * Native linkIdentity must preserve auth.users.id; a mismatch means another
 * permanent user claimed the GitHub identity.
 */
export function finalizeAnonymousLink(input: FinalizeLinkInput): FinalizeLinkResult {
  const { linkIntentUserId, userId, isAnonymous, hasGitHubProvider } = input;

  if (!linkIntentUserId) {
    if (isAnonymous) return { ok: false, code: "link_incomplete" };
    if (!hasGitHubProvider) return { ok: false, code: "session_missing" };
    return { ok: true, kind: "returning_sign_in" };
  }

  if (userId !== linkIntentUserId) {
    return { ok: false, code: "identity_conflict" };
  }

  if (isAnonymous) {
    return { ok: false, code: "link_incomplete" };
  }

  if (!hasGitHubProvider) {
    return { ok: false, code: "link_incomplete" };
  }

  return { ok: true, kind: "linked" };
}
