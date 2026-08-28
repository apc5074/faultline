"use client";

import type { SubmitOfficialResponse } from "@/app/api/submissions/route";
import { activeChallenge } from "@/features/architecture-canvas/playground-challenge";
import { formatLeaderboardCost, formatSolveTime } from "@/lib/leaderboards/format";
import { ShareResultActions } from "./ShareResultActions";

type VerifiedSubmission = Extract<SubmitOfficialResponse, { ok: true }>;

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function OfficialScorecard({ result, stale }: { result: VerifiedSubmission; stale: boolean }) {
  const passed = result.allRequirementsPass && result.withinBudget;
  return (
    <section className={`official-scorecard${stale ? " official-scorecard--stale" : ""}`} aria-label="Official verification scorecard">
      <div className="official-scorecard__heading">
        <div>
          <p className="official-scorecard__eyebrow">Server-verified submission</p>
          <h2>{passed ? "PASS" : "Verified — not eligible"}</h2>
        </div>
        <span className="official-scorecard__version">sim {result.simulatorVersion}</span>
      </div>
      {stale ? <p className="official-scorecard__stale">Architecture changed after verification — edit and run again for current evidence.</p> : null}
      <dl className="official-scorecard__metrics tabular">
        <div><dt>Solve time</dt><dd>{result.officialSolveMs === null ? "—" : formatSolveTime(result.officialSolveMs)}</dd></div>
        <div><dt>Monthly cost</dt><dd>{formatLeaderboardCost(result.cost.monthlyTotal)} / {formatLeaderboardCost(activeChallenge.monthlyBudget)}</dd></div>
        <div><dt>p95 latency</dt><dd>{result.metrics.p95LatencyMs.toFixed(1)} ms</dd></div>
        <div><dt>Headroom</dt><dd>{formatPercent(result.metrics.headroom)}</dd></div>
      </dl>
      <div className="official-scorecard__requirements">
        <p className="official-scorecard__label">Verified requirements</p>
        <ul>
          {activeChallenge.requirements.map((definition) => {
            const requirement = result.requirements.find((candidate) => candidate.id === definition.id);
            return <li key={definition.id}><span className={requirement?.passed ? "official-scorecard__pass" : "official-scorecard__fail"}>{requirement?.passed ? "PASS" : "FAIL"}</span><span>{definition.label}</span></li>;
          })}
        </ul>
      </div>
      <p className="official-scorecard__id">Submission {result.submissionId}</p>
      {result.dailyBest ? <p className="official-scorecard__best">Daily best · {formatSolveTime(result.dailyBest.fastestSolveMs)} fastest · {formatLeaderboardCost(result.dailyBest.cheapestCost)} cheapest</p> : null}
      <ShareResultActions submissionId={result.submissionId} enabled={passed && !stale} />
      <p className="official-scorecard__hint">You can keep editing the architecture and run it again.</p>
    </section>
  );
}
