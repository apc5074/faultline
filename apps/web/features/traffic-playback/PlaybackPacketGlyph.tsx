import type { PacketShape } from "./types";

const INK = "var(--color-ink)";
const RED = "var(--color-signal-red)";

export function PlaybackPacketGlyph({ shape, x, y }: { shape: PacketShape; x: number; y: number }) {
  if (shape === "rejected") {
    return (
      <g transform={`translate(${x} ${y})`} className="playback-packet playback-packet--rejected">
        <line x1={-4} y1={-4} x2={4} y2={4} stroke={RED} strokeWidth={1.5} />
        <line x1={4} y1={-4} x2={-4} y2={4} stroke={RED} strokeWidth={1.5} />
      </g>
    );
  }

  if (shape === "event") {
    return (
      <polygon
        className="playback-packet playback-packet--event"
        points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`}
        fill={INK}
      />
    );
  }

  if (shape === "write") {
    return (
      <g className="playback-packet playback-packet--write">
        <rect x={x - 5} y={y - 5} width={10} height={10} fill="none" stroke={INK} strokeWidth={1.5} />
        <line x1={x - 2} y1={y} x2={x + 2} y2={y} stroke={INK} strokeWidth={1.5} />
      </g>
    );
  }

  if (shape === "response") {
    return (
      <rect
        className="playback-packet playback-packet--response"
        x={x - 3.5}
        y={y - 3.5}
        width={7}
        height={7}
        fill={INK}
      />
    );
  }

  return (
    <rect
      className="playback-packet playback-packet--request"
      x={x - 3.5}
      y={y - 3.5}
      width={7}
      height={7}
      fill="none"
      stroke={INK}
      strokeWidth={1.25}
    />
  );
}
