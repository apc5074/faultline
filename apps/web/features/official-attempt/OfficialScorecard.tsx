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
  const ranks = result.eligible ? result.leaderboardRanks : null;
  return (
    <section className={`official-scorecard${stale ? " official-scorecard--stale" : ""}`} aria-label="Official verification scorecard">
      <div className="official-scorecard__heading">
        <div>
          <h2>{passed ? "PASS" : "Verified — not eligible"}</h2>
        </div>
      </div>
      {ranks ? (
        <div className="official-scorecard__rank">
          <p className="official-scorecard__rank-summary tabular">
            <span className="official-scorecard__rank-mark" aria-hidden>
              ✓
            </span>{" "}
            {ranks.alias}
          </p>
          <p className="official-scorecard__rank-meta tabular">
            Fastest #{ranks.fastestRank} · Cheapest #{ranks.cheapestRank}
          </p>
          <p className="official-scorecard__rank-meta">Server-verified pass · within budget</p>
        </div>
      ) : null}
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
      {result.dailyBest ? <p className="official-scorecard__best">Daily best · {formatSolveTime(result.dailyBest.fastestSolveMs)} fastest · {formatLeaderboardCost(result.dailyBest.cheapestCost)} cheapest</p> : null}
      <ShareResultActions submissionId={result.submissionId} enabled={passed && !stale} />
      <p className="official-scorecard__hint">You can keep editing the architecture and run it again.</p>
    </section>
  );
}
