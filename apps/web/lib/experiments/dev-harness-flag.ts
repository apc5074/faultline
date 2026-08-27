const DEV_EXPERIMENTS_FLAG = "NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS";

type HarnessEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS?: string;
};

export type DevExperimentHarnessStatus =
  | { enabled: true }
  | { enabled: false; code: "DEV_EXPERIMENTS_DISABLED"; message: string };

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * Browser-safe gate for the local experiment harness.
 * Production is always disabled, regardless of any public environment value.
 */
export function isDevExperimentHarnessEnabled(
  environment: HarnessEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production" && isTruthyFlag(environment.NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS);
}

/** Stable controlled result for callers that need to render an unavailable state. */
export function getDevExperimentHarnessStatus(
  environment: HarnessEnvironment = process.env,
): DevExperimentHarnessStatus {
  if (isDevExperimentHarnessEnabled(environment)) return { enabled: true };
  return {
    enabled: false,
    code: "DEV_EXPERIMENTS_DISABLED",
    message: "Development experiment controls are disabled in this environment.",
  };
}

export { DEV_EXPERIMENTS_FLAG };
