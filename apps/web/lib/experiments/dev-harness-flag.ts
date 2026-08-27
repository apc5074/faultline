const DEV_EXPERIMENTS_FLAG = "NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS";

/** localStorage key for showing/hiding the floating harness UI (dev only). */
export const DEV_EXPERIMENTS_UI_STORAGE_KEY = "faultline:dev-experiments-ui";

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

function isExplicitFalseFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}

function readPublicFlag(environment?: HarnessEnvironment): string | undefined {
  return (
    environment?.NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS ??
    process.env.NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS
  );
}

function readNodeEnv(environment?: HarnessEnvironment): string | undefined {
  return environment?.NODE_ENV ?? process.env.NODE_ENV;
}

/**
 * Whether the experiment harness is allowed in this environment.
 *
 * - Explicit `false`/`0`/`off` → always off
 * - Explicit `true`/`1`/`on` → on (including preview builds)
 * - Unset → on in `development` / `test` (local convenience; Turbopack often
 *   fails to inline root `.env` NEXT_PUBLIC_* into the client bundle)
 * - Unset in production → off
 */
export function isDevExperimentHarnessEnabled(
  environment?: HarnessEnvironment,
): boolean {
  const flag = readPublicFlag(environment);
  if (isExplicitFalseFlag(flag)) return false;
  if (isTruthyFlag(flag)) return true;
  const nodeEnv = readNodeEnv(environment);
  return nodeEnv === "development" || nodeEnv === "test";
}

/** Stable controlled result for callers that need to render an unavailable state. */
export function getDevExperimentHarnessStatus(
  environment?: HarnessEnvironment,
): DevExperimentHarnessStatus {
  if (isDevExperimentHarnessEnabled(environment)) return { enabled: true };
  return {
    enabled: false,
    code: "DEV_EXPERIMENTS_DISABLED",
    message: "Development experiment controls are disabled in this environment.",
  };
}

export { DEV_EXPERIMENTS_FLAG };
