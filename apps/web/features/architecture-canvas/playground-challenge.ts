import { getLevelCurriculum, getLevelStarterArchitecture, urlShortenerChallenge } from "@faultline/challenges";

/** Primary playable Level 1 challenge. Tiny API remains available for package regression. */
export const activeChallenge = urlShortenerChallenge;

export const activeLevelCurriculum = getLevelCurriculum("url-shortener");

/** Fresh inherited MVP starter for the active Level 1 challenge. */
export function activeLevelStarterArchitecture() {
  return getLevelStarterArchitecture("url-shortener");
}

export const challengeRedirectRps =
  activeChallenge.workload.requestsPerSecond * activeChallenge.workload.readRatio;

export const challengeWriteRps =
  activeChallenge.workload.requestsPerSecond * activeChallenge.workload.writeRatio;

export const challengeHotKeyFraction = activeChallenge.workload.hotKeyReadFraction ?? 0;

export const challengeReadWriteRatioLabel =
  challengeWriteRps > 0 ? `${Math.round(challengeRedirectRps / challengeWriteRps)}:1` : "reads only";

export const challengeHotKeyLabel =
  challengeHotKeyFraction > 0
    ? `${Math.round(challengeHotKeyFraction * 100)}% viral key`
    : "no viral key";
