"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type OfficialAttemptSession = {
  attemptId: string;
  challengeVersion: number;
  alias: string;
  startedAt: string;
};

type OfficialAttemptContextValue = {
  session: OfficialAttemptSession | null;
  setSession: (session: OfficialAttemptSession | null) => void;
  /** Bumped after verified submission so rank HUD refetches. */
  rankRefreshToken: number;
  bumpRankRefresh: () => void;
};

const OfficialAttemptContext = createContext<OfficialAttemptContextValue | null>(null);

export function OfficialAttemptProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OfficialAttemptSession | null>(null);
  const [rankRefreshToken, setRankRefreshToken] = useState(0);
  const bumpRankRefresh = useCallback(() => {
    setRankRefreshToken((token) => token + 1);
  }, []);
  const value = useMemo(
    () => ({ session, setSession, rankRefreshToken, bumpRankRefresh }),
    [session, rankRefreshToken, bumpRankRefresh],
  );
  return <OfficialAttemptContext.Provider value={value}>{children}</OfficialAttemptContext.Provider>;
}

export function useOfficialAttempt(): OfficialAttemptContextValue {
  const value = useContext(OfficialAttemptContext);
  if (!value) {
    throw new Error("useOfficialAttempt must be used within OfficialAttemptProvider.");
  }
  return value;
}
