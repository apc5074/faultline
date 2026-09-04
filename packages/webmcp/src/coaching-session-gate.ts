/**
 * Page-owned WebMCP coaching bootstrap guard. The host may call policy and
 * focus concurrently, but all other coaching capabilities wait until the
 * policy result has completed successfully for the active challenge.
 */
export interface CoachingSessionGate {
  check(capabilityName: string, challenge: CoachingChallenge): CoachingSessionGateCheck;
  acknowledgePolicy(challenge: CoachingChallenge): void;
}

type CoachingChallenge = { readonly slug: string; readonly version: number };

export interface CoachingSessionGateCheck {
  readonly allowed: boolean;
  /** A previously acknowledged policy belonged to another active challenge. */
  readonly reset: boolean;
}

function challengeKey(challenge: CoachingChallenge): string {
  return `${challenge.slug}:${challenge.version}`;
}

export function createCoachingSessionGate(): CoachingSessionGate {
  let acknowledgedChallengeKey: string | undefined;

  return {
    check(capabilityName, challenge) {
      const key = challengeKey(challenge);
      const reset = acknowledgedChallengeKey !== undefined && acknowledgedChallengeKey !== key;
      if (reset) acknowledgedChallengeKey = undefined;
      if (capabilityName === "get_coaching_policy" || capabilityName === "get_session_focus") {
        return { allowed: true, reset };
      }
      return { allowed: acknowledgedChallengeKey === key, reset };
    },
    acknowledgePolicy(challenge) {
      acknowledgedChallengeKey = challengeKey(challenge);
    },
  };
}
