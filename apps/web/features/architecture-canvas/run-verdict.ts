import type { RequirementsEvaluationResult } from "@faultline/simulator";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

export type RunVerdict = {
  passed: number;
  total: number;
  failed: number;
  allPassed: boolean;
};

/** Shared presentation summary for every post-run verdict surface. */
export function runVerdictSummary(result: SuccessfulSimulation): RunVerdict {
  const total = result.requirements.length + (result.hotKey.active ? 1 : 0);
  const passed = result.requirements.filter((requirement) => requirement.passed).length +
    (result.hotKey.active && result.hotKey.passed ? 1 : 0);
  return { passed, total, failed: total - passed, allPassed: result.allRequirementsPass };
}
