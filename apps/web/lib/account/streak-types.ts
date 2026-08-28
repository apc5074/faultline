export type ScheduledChallengeDay = {
  startsAt: string;
  endsAt: string;
  completed: boolean;
};

export type PlayerStreakSnapshot = {
  currentStreak: number;
  longestStreak: number;
  todayCompleted: boolean;
  lastCompletedStartsAt: string | null;
};

/**
 * Pure streak computation mirrored by get_player_streak().
 * Completion means an eligible daily_best row exists for the challenge day.
 */
export function computePlayerStreak(
  days: readonly ScheduledChallengeDay[],
  nowMs: number,
): PlayerStreakSnapshot {
  const sorted = [...days].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  const begun = sorted.filter((day) => Date.parse(day.startsAt) <= nowMs);

  let longestStreak = 0;
  let run = 0;
  let lastCompletedStartsAt: string | null = null;

  for (const day of begun) {
    if (day.completed) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
      lastCompletedStartsAt = day.startsAt;
    } else {
      run = 0;
    }
  }

  const activeDay = begun.find(
    (day) => Date.parse(day.startsAt) <= nowMs && Date.parse(day.endsAt) > nowMs,
  );
  const todayCompleted = activeDay?.completed ?? false;

  let currentStreak = 0;
  for (const day of [...begun].reverse()) {
    const inProgress = Date.parse(day.endsAt) > nowMs && !day.completed;
    if (inProgress) continue;
    if (day.completed) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
    todayCompleted,
    lastCompletedStartsAt,
  };
}

export type PlayerStreakResponse =
  | {
      ok: true;
      authenticated: false;
      requiresSignIn: true;
    }
  | {
      ok: true;
      authenticated: true;
      isAnonymous: true;
      requiresPermanentAccount: true;
    }
  | {
      ok: true;
      authenticated: true;
      isAnonymous: false;
      currentStreak: number;
      longestStreak: number;
      todayCompleted: boolean;
      lastCompletedStartsAt: string | null;
    }
  | {
      ok: false;
      error: string;
      code: "misconfigured" | "query_failed";
    };

export type PlayerStreakRpcRow = {
  current_streak: number;
  longest_streak: number;
  today_completed: boolean;
  last_completed_starts_at: string | null;
};

export function mapPlayerStreakRow(row: PlayerStreakRpcRow): PlayerStreakSnapshot {
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    todayCompleted: row.today_completed === true,
    lastCompletedStartsAt: row.last_completed_starts_at,
  };
}
