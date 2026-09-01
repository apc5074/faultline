interface SimBarProps {
  running: boolean;
  paused: boolean;
  speed: 0.5 | 1 | 2;
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (s: 0.5 | 1 | 2) => void;
}

const INK = "#1a1612";
const INK_FAINT = "#8a7f74";
const INK_HAIRLINE = "#c8bfb0";
const PAPER = "#f5f0e8";

export default function SimBar({
  running, paused, speed,
  onRun, onPause, onStep, onReset, onSpeedChange
}: SimBarProps) {
  const SPEEDS: (0.5 | 1 | 2)[] = [0.5, 1, 2];

  return (
    <div style={{
      height: 40,
      borderTop: `1px solid ${INK_HAIRLINE}`,
      background: "#ede7d9",
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: "0 16px",
      justifyContent: "center",
    }}>
      {/* Run / Pause */}
      <button
        onClick={running && !paused ? onPause : onRun}
        style={{
          height: 26,
          padding: "0 16px",
          border: `1px solid ${INK}`,
          background: running && !paused ? INK : PAPER,
          color: running && !paused ? PAPER : INK,
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {running && !paused ? "pause" : "run"}
      </button>

      {/* Step */}
      <button
        onClick={onStep}
        style={{
          height: 26,
          padding: "0 12px",
          border: `1px solid ${INK_HAIRLINE}`,
          borderLeft: "none",
          background: "none",
          color: INK_FAINT,
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        step
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        style={{
          height: 26,
          padding: "0 12px",
          border: `1px solid ${INK_HAIRLINE}`,
          borderLeft: "none",
          background: "none",
          color: INK_FAINT,
          fontFamily: "'Space Mono', monospace",
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        reset
      </button>

      <div style={{ width: 1, height: 20, background: INK_HAIRLINE, margin: "0 12px" }} />

      {/* Speed */}
      {SPEEDS.map(s => (
        <button
          key={s}
          onClick={() => onSpeedChange(s)}
          style={{
            height: 26,
            padding: "0 10px",
            border: `1px solid ${INK_HAIRLINE}`,
            borderLeft: s === 0.5 ? `1px solid ${INK_HAIRLINE}` : "none",
            background: speed === s ? INK : "none",
            color: speed === s ? PAPER : INK_FAINT,
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          {s}×
        </button>
      ))}
    </div>
  );
}
