import { ActiveDailyChallengeError, getActiveDailyChallenge } from "@/lib/challenges/daily";

export const dynamic = "force-dynamic";

/**
 * Returns the server-authoritative active official challenge.
 * Clients may display it; they must not invent competition config.
 */
export async function GET(): Promise<Response> {
  try {
    const active = await getActiveDailyChallenge();
    return Response.json({
      ok: true,
      dailyChallengeId: active.dailyChallengeId,
      startsAt: active.startsAt,
      endsAt: active.endsAt,
      challenge: {
        id: active.challengeVersion.id,
        slug: active.challengeVersion.slug,
        version: active.challengeVersion.version,
        configHash: active.challengeVersion.configHash,
        simulatorVersion: active.challengeVersion.simulatorVersion,
        createdAt: active.challengeVersion.createdAt,
        config: active.challengeVersion.config,
      },
    });
  } catch (error) {
    if (error instanceof ActiveDailyChallengeError) {
      const status =
        error.code === "misconfigured" ? 503 : error.code === "not_found" ? 404 : 500;
      return Response.json({ ok: false, error: error.message, code: error.code }, { status });
    }
    throw error;
  }
}
