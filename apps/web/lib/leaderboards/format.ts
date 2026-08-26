/**
 * Presentation helpers for public leaderboard rows.
 * Ranking order itself is enforced in SQL (`list_fastest_leaderboard` / `list_cheapest_leaderboard`).
 */

/** mm:ss (or h:mm:ss) from official solve milliseconds. */
export function formatSolveTime(solveMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(solveMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Compact educational monthly cost for leaderboard cells. */
export function formatLeaderboardCost(amount: number): string {
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    const rounded = Math.round(thousands * 10) / 10;
    return `$${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * In-memory comparator mirroring SQL fastest order (for unit verification).
 * Final userId compare is deterministic only — never shown in UI.
 */
export function compareFastestLeaderboardRows(
  left: { fastestSolveMs: number; costAtFastest: number; userId: string },
  right: { fastestSolveMs: number; costAtFastest: number; userId: string },
): number {
  if (left.fastestSolveMs !== right.fastestSolveMs) {
    return left.fastestSolveMs - right.fastestSolveMs;
  }
  if (left.costAtFastest !== right.costAtFastest) {
    return left.costAtFastest - right.costAtFastest;
  }
  return left.userId.localeCompare(right.userId);
}

/**
 * In-memory comparator mirroring SQL cheapest order (for unit verification).
 * Final userId compare is deterministic only — never shown in UI.
 */
export function compareCheapestLeaderboardRows(
  left: { cheapestCost: number; solveTimeAtCheapestMs: number; userId: string },
  right: { cheapestCost: number; solveTimeAtCheapestMs: number; userId: string },
): number {
  if (left.cheapestCost !== right.cheapestCost) {
    return left.cheapestCost - right.cheapestCost;
  }
  if (left.solveTimeAtCheapestMs !== right.solveTimeAtCheapestMs) {
    return left.solveTimeAtCheapestMs - right.solveTimeAtCheapestMs;
  }
  return left.userId.localeCompare(right.userId);
}
