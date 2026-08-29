export type PlayerAccountSummaryResponse =
  | { ok: true; authenticated: false }
  | { ok: true; authenticated: true; isAnonymous: true }
  | {
      ok: true;
      authenticated: true;
      isAnonymous: false;
      currentStreak: number;
      longestStreak: number;
      todayCompleted: boolean;
      lastCompletedStartsAt: string | null;
      completionDays: string[];
      bestRank: number | null;
    }
  | { ok: false; error: string; code: "misconfigured" | "query_failed" };
