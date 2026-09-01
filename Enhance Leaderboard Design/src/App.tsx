import { useState } from "react";

type Entry = {
  rank: number;
  alias: string;
  solveMs: number;
  cost: number;
};

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const secs = Math.round(s % 60).toString().padStart(2, "0");
  return `${m}m${secs}s`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

const ALL_ROWS: Entry[] = [
  { rank: 1, alias: "archipelago", solveMs: 4820, cost: 0.0041 },
  { rank: 2, alias: "praxis_seven", solveMs: 5110, cost: 0.0038 },
  { rank: 3, alias: "drift_wolf", solveMs: 5340, cost: 0.0044 },
  { rank: 4, alias: "neon_circuit", solveMs: 6200, cost: 0.0052 },
  { rank: 5, alias: "fault_finder", solveMs: 6590, cost: 0.0061 },
  { rank: 6, alias: "deep_resonance", solveMs: 7120, cost: 0.0055 },
  { rank: 7, alias: "vector_ghost", solveMs: 7830, cost: 0.0063 },
  { rank: 8, alias: "parallel_run", solveMs: 8240, cost: 0.0071 },
  { rank: 9, alias: "async_void", solveMs: 9010, cost: 0.0079 },
  { rank: 10, alias: "latency_hawk", solveMs: 9450, cost: 0.0082 },
  { rank: 623, alias: "thread_glitch", solveMs: 48200, cost: 0.0214 },
  { rank: 624, alias: "packet_fall", solveMs: 49100, cost: 0.0218 },
  { rank: 625, alias: "you", solveMs: 49800, cost: 0.0221 },
  { rank: 626, alias: "bloom_filter", solveMs: 50200, cost: 0.0225 },
  { rank: 627, alias: "cron_daemon", solveMs: 51400, cost: 0.0232 },
];

const MY_RANK = 625;

export default function App() {
  const [mode, setMode] = useState<"fastest" | "cheapest">("fastest");

  const topRows = ALL_ROWS.filter((r) => r.rank <= 10);
  const nearbyRows = ALL_ROWS.filter(
    (r) => r.rank >= MY_RANK - 2 && r.rank <= MY_RANK + 2,
  );

  function primary(e: Entry) {
    return mode === "fastest" ? formatTime(e.solveMs) : formatCost(e.cost);
  }
  function secondary(e: Entry) {
    return mode === "fastest" ? formatCost(e.cost) : formatTime(e.solveMs);
  }

  const skipped = nearbyRows[0].rank - topRows[topRows.length - 1].rank - 1;

  return (
    <div className="lb-demo">
      <div className="lb-demo__inner">
        <h2 className="lb-demo__heading">Today&apos;s Leaderboard</h2>

        <aside className="lb-demo__plate" aria-label="Daily leaderboard">
          <div className="lb-demo__toolbar">
            <span className="lb-demo__title">Leaderboard</span>
            <button type="button" className="lb-demo__refresh">
              Refresh
            </button>
          </div>

          <div
            className="lb-demo__segmented"
            role="group"
            aria-label="Leaderboard mode"
          >
            <button
              type="button"
              className={`lb-demo__seg${mode === "fastest" ? " lb-demo__seg--on" : ""}`}
              aria-pressed={mode === "fastest"}
              onClick={() => setMode("fastest")}
            >
              Fastest
            </button>
            <button
              type="button"
              className={`lb-demo__seg lb-demo__seg--joined${mode === "cheapest" ? " lb-demo__seg--on" : ""}`}
              aria-pressed={mode === "cheapest"}
              onClick={() => setMode("cheapest")}
            >
              Cheapest
            </button>
          </div>

          <p className="lb-demo__meta">
            faultline-daily v12 &middot;{" "}
            {mode === "fastest" ? "by time" : "by cost"}
          </p>
          <p className="lb-demo__meta">
            Verified solves only &middot; all requirements pass &middot; within
            budget
          </p>

          {/* ── Podium: top 3 ── */}
          <section className="lb-podium" aria-label="Top 3">
            {topRows.slice(0, 3).map((entry, i) => (
              <div
                key={entry.rank}
                className={`lb-podium__row lb-podium__row--${i + 1}`}
              >
                <span className="lb-podium__glyph" aria-hidden>
                  {i === 0 ? "◆" : i === 1 ? "◇" : "▸"}
                </span>
                <span className="lb-podium__num">#{entry.rank}</span>
                <span className="lb-podium__alias">{entry.alias}</span>
                <span className="lb-podium__pri">{primary(entry)}</span>
                <span className="lb-podium__sec">{secondary(entry)}</span>
              </div>
            ))}
          </section>

          {/* ── Ranks 4–10 ── */}
          <ol className="lb-list" aria-label="Ranks 4–10">
            {topRows.slice(3).map((entry) => (
              <li key={entry.rank} className="lb-list__row">
                <span className="lb-list__num">#{entry.rank}</span>
                <span className="lb-list__alias">{entry.alias}</span>
                <span className="lb-list__pri">{primary(entry)}</span>
                <span className="lb-list__sec">{secondary(entry)}</span>
              </li>
            ))}
          </ol>

          {/* ── Gap ── */}
          <div
            className="lb-gap"
            aria-label={`${skipped} entries not shown`}
          >
            <span className="lb-gap__rule" aria-hidden />
            <span className="lb-gap__label">+{skipped} entries</span>
            <span className="lb-gap__rule" aria-hidden />
          </div>

          {/* ── Nearby: ranks 623–627 ── */}
          <ol className="lb-list lb-list--nearby" aria-label="Your position">
            {nearbyRows.map((entry) => (
              <li
                key={entry.rank}
                className={`lb-list__row${entry.rank === MY_RANK ? " lb-list__row--you" : ""}`}
              >
                <span className="lb-list__num">#{entry.rank}</span>
                <span className="lb-list__alias">
                  {entry.alias}
                  {entry.rank === MY_RANK ? (
                    <span className="lb-list__you-tag">you</span>
                  ) : null}
                </span>
                <span className="lb-list__pri">{primary(entry)}</span>
                <span className="lb-list__sec">{secondary(entry)}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
